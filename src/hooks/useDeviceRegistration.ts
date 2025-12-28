"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { callEdgeFunction, fetchQrImage, getStoredToken } from "@/lib/apiClient";
import type { RegistrationSessionDTO } from "@/types/DeviceDTO";
import { logError, logInfo } from "@/lib/debugLogger";

interface RegistrationState {
  showModal: boolean;
  session: RegistrationSessionDTO | null;
  qrImageUrl: string;
  qrLoading: boolean;
  qrError: string;
  timeRemaining: number;
  status: "awaiting" | "completed" | "expired";
  matchedDevice: { device_id: string; friendly_name?: string } | null;
  checkingDevice: boolean;
  // Hybrid form state
  hybridDeviceIdInput: string;
  hybridSubmitLoading: boolean;
  hybridSubmitError: string | null;
  hybridSubmitSuccess: string | null;
}

interface UseDeviceRegistrationResult extends RegistrationState {
  startRegistration: () => Promise<void>;
  restartRegistration: () => void;
  closeModal: () => void;
  checkForDevice: () => Promise<void>;
  setHybridDeviceIdInput: (value: string) => void;
  submitHybridDeviceId: () => Promise<void>;
}

// RustDesk ID validation constants
const MIN_RUSTDESK_ID_LENGTH = 6;
const MAX_RUSTDESK_ID_LENGTH = 12;

export function useDeviceRegistration(
  onDeviceRegistered?: () => void
): UseDeviceRegistrationResult {
  const [state, setState] = useState<RegistrationState>({
    showModal: false,
    session: null,
    qrImageUrl: "",
    qrLoading: false,
    qrError: "",
    timeRemaining: 0,
    status: "awaiting",
    matchedDevice: null,
    checkingDevice: false,
    hybridDeviceIdInput: "",
    hybridSubmitLoading: false,
    hybridSubmitError: null,
    hybridSubmitSuccess: null,
  });

  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const cleanupCountdown = useCallback(() => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }, []);

  const cleanupQrUrl = useCallback(() => {
    if (state.qrImageUrl) {
      URL.revokeObjectURL(state.qrImageUrl);
    }
  }, [state.qrImageUrl]);

  const resetState = useCallback(() => {
    cleanupCountdown();
    cleanupQrUrl();
    setState({
      showModal: false,
      session: null,
      qrImageUrl: "",
      qrLoading: false,
      qrError: "",
      timeRemaining: 0,
      status: "awaiting",
      matchedDevice: null,
      checkingDevice: false,
      hybridDeviceIdInput: "",
      hybridSubmitLoading: false,
      hybridSubmitError: null,
      hybridSubmitSuccess: null,
    });
  }, [cleanupCountdown, cleanupQrUrl]);

  const startRegistration = useCallback(async () => {
    const jwt = getStoredToken();
    if (!jwt) return;

    cleanupCountdown();
    cleanupQrUrl();

    setState((prev) => ({
      ...prev,
      showModal: true,
      qrLoading: true,
      qrError: "",
      status: "awaiting",
      matchedDevice: null,
      timeRemaining: 300,
      checkingDevice: false,
      hybridDeviceIdInput: "",
      hybridSubmitError: null,
      hybridSubmitSuccess: null,
    }));

    try {
      // Start session
      const sessionResult = await callEdgeFunction<{
        session_id: string;
        expires_at: string;
        expires_in_seconds: number;
      }>("start-registration-session", {
        method: "POST",
        body: { geolocation: null },
      });

      if (!sessionResult.ok || !sessionResult.data) {
        throw new Error(sessionResult.error?.message || "Failed to start session");
      }

      const session: RegistrationSessionDTO = {
        sessionId: sessionResult.data.session_id,
        expiresAt: sessionResult.data.expires_at,
        expiresInSeconds: sessionResult.data.expires_in_seconds,
      };

      // Fetch QR image
      const qrResult = await fetchQrImage();
      if (!qrResult.ok || !qrResult.data) {
        throw new Error(qrResult.error?.message || "Failed to generate QR code");
      }

      setState((prev) => ({
        ...prev,
        session,
        qrImageUrl: qrResult.data!,
        timeRemaining: session.expiresInSeconds,
        qrLoading: false,
      }));

      // Start countdown
      countdownIntervalRef.current = setInterval(() => {
        setState((prev) => {
          if (prev.timeRemaining <= 1) {
            cleanupCountdown();
            return { ...prev, timeRemaining: 0, status: "expired" };
          }
          return { ...prev, timeRemaining: prev.timeRemaining - 1 };
        });
      }, 1000);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setState((prev) => ({
        ...prev,
        qrError: errorMsg,
        qrLoading: false,
      }));
    }
  }, [cleanupCountdown, cleanupQrUrl]);

  const restartRegistration = useCallback(() => {
    cleanupCountdown();
    cleanupQrUrl();
    setState((prev) => ({
      ...prev,
      session: null,
      qrImageUrl: "",
      qrError: "",
      status: "awaiting",
      matchedDevice: null,
      timeRemaining: 0,
      hybridDeviceIdInput: "",
      hybridSubmitError: null,
      hybridSubmitSuccess: null,
    }));
    void startRegistration();
  }, [cleanupCountdown, cleanupQrUrl, startRegistration]);

  const closeModal = useCallback(() => {
    resetState();
  }, [resetState]);

  const checkForDevice = useCallback(async () => {
    const jwt = getStoredToken();
    if (!jwt || !state.session) return;

    setState((prev) => ({ ...prev, checkingDevice: true, qrError: "" }));

    try {
      const result = await callEdgeFunction<{
        status: string;
        device_id?: string;
      }>(`check-registration-status?session_id=${state.session.sessionId}`);

      if (!result.ok) {
        throw new Error(result.error?.message || "Failed to check registration status");
      }

      if (result.data?.status === "completed") {
        cleanupCountdown();
        setState((prev) => ({
          ...prev,
          status: "completed",
          matchedDevice: result.data?.device_id
            ? { device_id: result.data.device_id }
            : null,
          checkingDevice: false,
        }));

        setTimeout(() => {
          onDeviceRegistered?.();
        }, 1000);
      } else if (result.data?.status === "expired") {
        cleanupCountdown();
        setState((prev) => ({ ...prev, status: "expired", checkingDevice: false }));
      } else {
        setState((prev) => ({
          ...prev,
          qrError: "Device not detected yet. Make sure you scanned the QR code in RustDesk.",
          checkingDevice: false,
        }));
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setState((prev) => ({ ...prev, qrError: errorMsg, checkingDevice: false }));
    }
  }, [state.session, cleanupCountdown, onDeviceRegistered]);

  const setHybridDeviceIdInput = useCallback((value: string) => {
    // Only allow digits, already filtered in component but double-check here
    const sanitized = value.replace(/\D/g, "");
    setState((prev) => ({
      ...prev,
      hybridDeviceIdInput: sanitized,
      // Clear previous messages when user types
      hybridSubmitError: null,
      hybridSubmitSuccess: null,
    }));
  }, []);

  /**
   * Submit the RustDesk ID for deterministic device adoption.
   * This sends the device_id (rustdesk_id) to the backend along with
   * the current user's identity (derived from JWT).
   */
  const submitHybridDeviceId = useCallback(async () => {
    const jwt = getStoredToken();
    if (!jwt) {
      setState((prev) => ({
        ...prev,
        hybridSubmitError: "Sessão inválida. Por favor, inicie sessão novamente.",
        hybridSubmitSuccess: null,
      }));
      return;
    }

    // Sanitize: remove all whitespace
    const sanitized = state.hybridDeviceIdInput.replace(/\s+/g, "");

    // Validation: must not be empty
    if (!sanitized) {
      setState((prev) => ({
        ...prev,
        hybridSubmitError: "Por favor, introduza o RustDesk ID.",
        hybridSubmitSuccess: null,
      }));
      return;
    }

    // Validation: must be digits only
    if (!/^\d+$/.test(sanitized)) {
      setState((prev) => ({
        ...prev,
        hybridSubmitError: "O RustDesk ID deve conter apenas dígitos.",
        hybridSubmitSuccess: null,
      }));
      return;
    }

    // Validation: length must be between 6-12 digits
    if (sanitized.length < MIN_RUSTDESK_ID_LENGTH) {
      setState((prev) => ({
        ...prev,
        hybridSubmitError: `O RustDesk ID deve ter pelo menos ${MIN_RUSTDESK_ID_LENGTH} dígitos.`,
        hybridSubmitSuccess: null,
      }));
      return;
    }

    if (sanitized.length > MAX_RUSTDESK_ID_LENGTH) {
      setState((prev) => ({
        ...prev,
        hybridSubmitError: `O RustDesk ID deve ter no máximo ${MAX_RUSTDESK_ID_LENGTH} dígitos.`,
        hybridSubmitSuccess: null,
      }));
      return;
    }

    logInfo("useDeviceRegistration", "Submitting hybrid RustDesk ID", {
      device_id: sanitized,
      length: sanitized.length,
    });

    setState((prev) => ({
      ...prev,
      hybridSubmitLoading: true,
      hybridSubmitError: null,
      hybridSubmitSuccess: null,
    }));

    try {
      // Call register-device with the rustdesk_id (device_id)
      // The backend will:
      // 1. Validate the device_id format (digits only, 6-12 length)
      // 2. Resolve the current user from JWT
      // 3. Create or update the device with deterministic ownership
      // 4. Use upsert for idempotency (same device_id = same record)
      const result = await callEdgeFunction<{
        success: boolean;
        device?: {
          id: string;
          device_id: string;
          owner: string;
        };
        error?: string;
        message?: string;
      }>("register-device", {
        method: "POST",
        body: {
          device_id: sanitized,
          last_seen: new Date().toISOString(),
          observations: "QR-hybrid adoption",
        },
      });

      if (!result.ok) {
        // Map backend errors to user-friendly Portuguese messages
        let errorMessage = result.error?.message || "Erro ao registar dispositivo.";
        
        if (result.error?.code === "invalid_device_id") {
          errorMessage = "Formato de RustDesk ID inválido. Deve conter apenas dígitos (6-12).";
        } else if (result.error?.code === "mesh_user_not_found") {
          errorMessage = "Utilizador não encontrado. Por favor, inicie sessão novamente.";
        } else if (result.error?.code === "unauthorized") {
          errorMessage = "Sessão expirada. Por favor, inicie sessão novamente.";
        }

        setState((prev) => ({
          ...prev,
          hybridSubmitError: errorMessage,
          hybridSubmitSuccess: null,
          hybridSubmitLoading: false,
        }));
        return;
      }

      logInfo("useDeviceRegistration", "Device registered successfully", {
        device_id: result.data?.device?.device_id,
      });

      // Update UI to show success
      setState((prev) => ({
        ...prev,
        hybridSubmitError: null,
        hybridSubmitSuccess: `Dispositivo ${sanitized} registado com sucesso!`,
        hybridSubmitLoading: false,
        status: "completed",
        matchedDevice: { device_id: sanitized },
      }));

      // Notify parent to refresh device list
      setTimeout(() => {
        onDeviceRegistered?.();
      }, 500);

    } catch (error) {
      logError("useDeviceRegistration", "Hybrid submission failed", { error });
      setState((prev) => ({
        ...prev,
        hybridSubmitError: "Ocorreu um erro de rede. Por favor, tente novamente.",
        hybridSubmitSuccess: null,
        hybridSubmitLoading: false,
      }));
    }
  }, [state.hybridDeviceIdInput, onDeviceRegistered]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupCountdown();
    };
  }, [cleanupCountdown]);

  return {
    ...state,
    startRegistration,
    restartRegistration,
    closeModal,
    checkForDevice,
    setHybridDeviceIdInput,
    submitHybridDeviceId,
  };
}
