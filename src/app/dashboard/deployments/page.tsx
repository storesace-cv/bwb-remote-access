"use client";

import { useEffect, useState } from "react";

interface DeploymentRecord {
  timestamp: string;
  buildId: string;
  status: string;
  localFiles?: string;
  remoteFiles?: string;
}

export default function DeploymentsPage() {
  const [deployments, setDeployments] = useState<DeploymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDeploymentHistory();
  }, []);

  const fetchDeploymentHistory = async () => {
    try {
      setLoading(true);
      setError(null);

      // In a real implementation, this would fetch from an API endpoint
      // For now, we'll show a placeholder
      const mockDeployments: DeploymentRecord[] = [
        {
          timestamp: "2025-12-10 21:44:45 UTC",
          buildId: "Production",
          status: "SUCCESS",
          localFiles: "156",
          remoteFiles: "156"
        }
      ];

      setDeployments(mockDeployments);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch deployment history");
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "SUCCESS":
        return "text-green-400";
      case "FAILED":
        return "text-red-400";
      case "IN_PROGRESS":
        return "text-yellow-400";
      default:
        return "text-gray-400";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "SUCCESS":
        return "✅";
      case "FAILED":
        return "❌";
      case "IN_PROGRESS":
        return "⏳";
      default:
        return "⚪";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Deployment History</h1>
          <p className="text-slate-400">Track all deployments to production</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700">
            <div className="text-slate-400 text-sm mb-1">Total Deployments</div>
            <div className="text-3xl font-bold">{deployments.length}</div>
          </div>
          
          <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700">
            <div className="text-slate-400 text-sm mb-1">Successful</div>
            <div className="text-3xl font-bold text-green-400">
              {deployments.filter(d => d.status === "SUCCESS").length}
            </div>
          </div>
          
          <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700">
            <div className="text-slate-400 text-sm mb-1">Failed</div>
            <div className="text-3xl font-bold text-red-400">
              {deployments.filter(d => d.status === "FAILED").length}
            </div>
          </div>
          
          <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700">
            <div className="text-slate-400 text-sm mb-1">Success Rate</div>
            <div className="text-3xl font-bold text-blue-400">
              {deployments.length > 0 
                ? Math.round((deployments.filter(d => d.status === "SUCCESS").length / deployments.length) * 100)
                : 0}%
            </div>
          </div>
        </div>

        {/* Deployment Table */}
        <div className="bg-slate-800/50 rounded-lg border border-slate-700 overflow-hidden">
          <div className="p-6 border-b border-slate-700 flex justify-between items-center">
            <h2 className="text-xl font-semibold">Recent Deployments</h2>
            <button
              onClick={fetchDeploymentHistory}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors text-sm font-medium"
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="p-12 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
              <p className="mt-4 text-slate-400">Loading deployment history...</p>
            </div>
          ) : error ? (
            <div className="p-12 text-center">
              <div className="text-red-400 mb-2">❌ Error</div>
              <p className="text-slate-400">{error}</p>
              <button
                onClick={fetchDeploymentHistory}
                className="mt-4 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors text-sm"
              >
                Retry
              </button>
            </div>
          ) : deployments.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-slate-400 mb-2">📦</div>
              <p className="text-slate-400">No deployments found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-900/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Timestamp
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Build ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Files
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {deployments.map((deployment, index) => (
                    <tr key={index} className="hover:bg-slate-700/30 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`flex items-center gap-2 font-medium ${getStatusColor(deployment.status)}`}>
                          <span>{getStatusIcon(deployment.status)}</span>
                          {deployment.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                        {deployment.timestamp}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <code className="px-2 py-1 bg-slate-900 rounded text-xs text-blue-400">
                          {deployment.buildId}
                        </code>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                        {deployment.localFiles && deployment.remoteFiles
                          ? `${deployment.localFiles} → ${deployment.remoteFiles}`
                          : "N/A"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* System Status */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-6">
            <h3 className="text-lg font-semibold mb-4">Service Health</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Frontend Service</span>
                <span className="text-green-400 flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                  Active
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Port 3000</span>
                <span className="text-green-400 flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                  Listening
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">NGINX Proxy</span>
                <span className="text-green-400 flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                  Running
                </span>
              </div>
            </div>
          </div>

          <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-6">
            <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
            <div className="space-y-2">
              <button className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors text-left text-sm">
                📊 View Service Logs
              </button>
              <button className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors text-left text-sm">
                🔄 Restart Service
              </button>
              <button className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors text-left text-sm">
                📈 View Metrics
              </button>
            </div>
          </div>
        </div>

        {/* Documentation Link */}
        <div className="mt-8 bg-blue-900/20 border border-blue-800/30 rounded-lg p-6">
          <div className="flex items-start gap-4">
            <div className="text-3xl">📚</div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold mb-2">Deployment Documentation</h3>
              <p className="text-slate-400 mb-4">
                Learn how to deploy updates, troubleshoot issues, and manage the production environment.
              </p>
              <a
                href="/docs/DEPLOYMENT_GUIDE.md"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors text-sm font-medium"
              >
                View Deployment Guide →
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}