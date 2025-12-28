# 🧪 Guia de Testes - Fluxo de Registro de Dispositivos

## 📋 Checklist de Testes

### ✅ Fase 1: Setup e Configuração

- [ ] Database table `device_registration_sessions` criada
- [ ] Índices criados corretamente
- [ ] RLS policies ativas
- [ ] Edge Functions deployadas
- [ ] Script sync-devices.sh atualizado
- [ ] Cron job configurado

### ✅ Fase 2: Testes Unitários

#### Teste 2.1: Criar Sessão

```bash
# Setup
JWT="<seu-jwt-token>"
ANON_KEY="<sua-anon-key>"
URL="https://kqwaibgvmzcqeoctukoy.supabase.co"

# Criar sessão
curl -X POST "$URL/functions/v1/start-registration-session" \
  -H "Authorization: Bearer $JWT" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"geolocation": {"latitude": 38.7223, "longitude": -9.1393}}'

# Resultado esperado:
# {
#   "success": true,
#   "session_id": "uuid-aqui",
#   "expires_at": "2025-12-11T01:30:00Z",
#   "expires_in_seconds": 300
# }
```

**Validações:**
- [ ] Status code 200
- [ ] `session_id` é um UUID válido
- [ ] `expires_in_seconds` = 300
- [ ] `expires_at` = agora + 5 minutos

#### Teste 2.2: Verificar Status (Awaiting)

```bash
# Pegar SESSION_ID do teste anterior
SESSION_ID="uuid-da-sessao"

curl "$URL/functions/v1/check-registration-status?session_id=$SESSION_ID" \
  -H "Authorization: Bearer $JWT" \
  -H "apikey: $ANON_KEY"

# Resultado esperado:
# {
#   "success": true,
#   "status": "awaiting_device",
#   "expires_at": "...",
#   "time_remaining_seconds": 295,
#   "device_info": null,
#   "matched_at": null
# }
```

**Validações:**
- [ ] `status` = "awaiting_device"
- [ ] `time_remaining_seconds` diminuindo
- [ ] `device_info` = null

#### Teste 2.3: Gerar QR Code

```bash
curl "$URL/functions/v1/generate-qr-image" \
  -H "Authorization: Bearer $JWT" \
  -H "apikey: $ANON_KEY" \
  -o qr-test.svg

# Verificar arquivo
file qr-test.svg
# Resultado esperado: qr-test.svg: SVG Scalable Vector Graphics image

# Verificar conteúdo
cat qr-test.svg | grep "config="
# Deve conter: config={"host":"rustdesk.bwb.pt","relay":"rustdesk.bwb.pt","key":"UzHEW0g..."}
```

**Validações:**
- [ ] Arquivo SVG válido
- [ ] Contém configuração RustDesk
- [ ] Chave correta: `UzHEW0gpZLT6NIx3WAr9lvUG4Se2s7euUTKQ+SrvjJs=`

### ✅ Fase 3: Testes de Integração

#### Teste 3.1: Fluxo Completo - Sucesso

**Passo 1: User clica no botão**
```bash
# No dashboard, clicar em "Adicionar Dispositivo"
# Anotar session_id que aparece no console do browser
```

**Passo 2: Verificar sessão criada**
```sql
-- No Supabase Dashboard > SQL Editor
SELECT * FROM device_registration_sessions
WHERE user_id = '<seu-user-id>'
ORDER BY created_at DESC
LIMIT 1;

-- Validar:
-- status = 'awaiting_device'
-- expires_at > NOW()
-- ip_address preenchido
```

**Passo 3: Escanear QR no Android**
```
1. Abrir app RustDesk no Android
2. Ir em Settings > ID/Relay Server
3. Tocar em "Scan"
4. Escanear QR code do dashboard
5. Verificar que configuração foi aplicada:
   - ID Server: rustdesk.bwb.pt
   - Relay Server: rustdesk.bwb.pt
   - Key: UzHEW0g... (truncado)
```

**Passo 4: Aguardar sync (1-2 minutos)**
```bash
# Monitorar logs do sync
tail -f /opt/rustdesk-integration/logs/sync.log

# Procurar por linhas como:
# [sync-devices] ✅ MATCH: Device 123456789 → User uuid → Session uuid
# [sync-devices] ✅ Device atualizado com owner
# [sync-devices] ✅ Sessão marcada como completed
```

**Passo 5: Verificar no dashboard**
```
1. Dashboard deve mostrar automaticamente:
   ✅ Dispositivo adicionado!
   ID: 123456789
   Nome: [nome do device]

2. Device deve aparecer na lista de "Dispositivos Android"
```

**Passo 6: Validar no banco**
```sql
-- Verificar sessão
SELECT * FROM device_registration_sessions
WHERE id = '<session-id>';
-- status = 'completed'
-- matched_device_id = '123456789'
-- matched_at preenchido

-- Verificar device
SELECT * FROM android_devices
WHERE device_id = '123456789';
-- owner = <seu-user-id>
-- mesh_username = <seu-mesh-username>
-- last_seen_at recente
```

**✅ Critérios de Sucesso:**
- [ ] Sessão criada com status "awaiting"
- [ ] QR gerado corretamente
- [ ] Device apareceu no RustDesk
- [ ] Script sync detectou device
- [ ] Match automático realizado
- [ ] Sessão marcada "completed"
- [ ] Device associado ao user correto
- [ ] Dashboard mostrou feedback
- [ ] Device aparece na lista

#### Teste 3.2: Timeout (Sessão Expira)

**Passo 1: Criar sessão**
```bash
# Clicar "Adicionar Dispositivo"
# NÃO escanear QR
```

**Passo 2: Aguardar 6 minutos**
```bash
# Monitorar countdown no dashboard
# Deve chegar a 00:00 e mostrar "⏱️ Tempo Esgotado"
```

**Passo 3: Verificar status**
```sql
SELECT * FROM device_registration_sessions
WHERE id = '<session-id>';
-- status = 'expired'
-- matched_device_id = NULL
```

**✅ Critérios de Sucesso:**
- [ ] Countdown chegou a zero
- [ ] Modal mostrou "Tempo Esgotado"
- [ ] Sessão marcada "expired"
- [ ] Botão "Tentar Novamente" funciona

#### Teste 3.3: Múltiplos Dispositivos (Mesmo User)

**Passo 1: Device 1**
```
1. Clicar "Adicionar Dispositivo"
2. Escanear QR no Device 1
3. Aguardar match
4. Verificar sucesso
```

**Passo 2: Device 2**
```
1. Clicar "Adicionar outro dispositivo"
2. Escanear QR no Device 2
3. Aguardar match
4. Verificar sucesso
```

**Passo 3: Validar ambos**
```sql
SELECT device_id, owner, mesh_username, created_at
FROM android_devices
WHERE owner = '<seu-user-id>'
  AND deleted_at IS NULL
ORDER BY created_at DESC
LIMIT 2;

-- Ambos devem ter:
-- owner = <seu-user-id>
-- mesh_username = <seu-mesh-username>
```

**✅ Critérios de Sucesso:**
- [ ] Ambos devices associados ao user correto
- [ ] Ambos aparecem na lista
- [ ] Nenhum órfão criado

#### Teste 3.4: Dois Users Simultâneos

**Setup:**
- User A (browser 1): user_a@example.com
- User B (browser 2): user_b@example.com

**Execução:**
```
Tempo | User A | User B
------|--------|--------
00:00 | Clica "Adicionar" | -
00:05 | - | Clica "Adicionar"
00:10 | Escaneia QR | -
00:20 | - | Escaneia QR
00:30 | Aguarda sync | Aguarda sync
```

**Validação:**
```sql
-- Device do User A
SELECT * FROM android_devices
WHERE device_id = '<device-a>'
  AND owner = '<user-a-id>';

-- Device do User B
SELECT * FROM android_devices
WHERE device_id = '<device-b>'
  AND owner = '<user-b-id>';
```

**✅ Critérios de Sucesso:**
- [ ] Device A → User A
- [ ] Device B → User B
- [ ] Nenhuma confusão entre users
- [ ] Ambos receberam feedback correto

### ✅ Fase 4: Testes de Edge Cases

#### Teste 4.1: Device Órfão (Antes do Sistema)

**Cenário:** Device já existe no RustDesk mas não tem owner

**Setup:**
```sql
-- Criar device órfão manualmente
INSERT INTO android_devices (device_id, owner, mesh_username)
VALUES ('999999999', NULL, NULL);
```

**Ação:**
```
1. Clicar "Adicionar Dispositivo"
2. Verificar que device órfão NÃO é associado
3. Escanear QR em device novo
4. Verificar que device novo é associado
```

**✅ Critérios de Sucesso:**
- [ ] Device órfão continua sem owner
- [ ] Device novo é associado corretamente

#### Teste 4.2: Network Failure Durante Polling

**Execução:**
```
1. Clicar "Adicionar Dispositivo"
2. Desligar internet no browser
3. Aguardar algumas tentativas de polling falharem
4. Religar internet
5. Verificar que polling retoma
```

**✅ Critérios de Sucesso:**
- [ ] Polling continua tentando
- [ ] Sem crash do frontend
- [ ] Retoma automaticamente quando internet volta

#### Teste 4.3: Sync Script Falha

**Execução:**
```bash
# Simular falha do sync
sudo systemctl stop cron

# Criar sessão e escanear QR
# Device conecta mas sync não roda

# Aguardar 2-3 minutos
# Reativar cron
sudo systemctl start cron

# Aguardar próxima execução
```

**✅ Critérios de Sucesso:**
- [ ] Device é associado na próxima execução
- [ ] Nenhum dado perdido
- [ ] Sistema resiliente

### ✅ Fase 5: Testes de Performance

#### Teste 5.1: Load Test (10 Sessões Simultâneas)

```bash
# Script para criar múltiplas sessões
for i in {1..10}; do
  curl -X POST "$URL/functions/v1/start-registration-session" \
    -H "Authorization: Bearer $JWT" \
    -H "apikey: $ANON_KEY" \
    -H "Content-Type: application/json" &
done
wait

# Verificar que todas foram criadas
SELECT COUNT(*) FROM device_registration_sessions
WHERE created_at > NOW() - INTERVAL '1 minute';
-- Resultado esperado: 10
```

**✅ Critérios de Sucesso:**
- [ ] Todas sessões criadas com sucesso
- [ ] Nenhum timeout
- [ ] Response time < 500ms

#### Teste 5.2: Script Sync Performance

```bash
# Criar 20 devices órfãos
# Criar 20 sessões aguardando
# Rodar sync e medir tempo

time /opt/rustdesk-integration/scripts/sync-devices.sh

# Resultado esperado: < 30 segundos
```

**✅ Critérios de Sucesso:**
- [ ] Sync completa em < 30s
- [ ] Todos matches corretos
- [ ] Sem erros de SQL

### ✅ Fase 6: Testes de Segurança

#### Teste 6.1: Autenticação Requerida

```bash
# Tentar criar sessão sem JWT
curl -X POST "$URL/functions/v1/start-registration-session" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json"

# Resultado esperado: 401 Unauthorized
```

**✅ Critérios de Sucesso:**
- [ ] Status 401
- [ ] Mensagem de erro clara

#### Teste 6.2: RLS Policies

```sql
-- Como User A, tentar ver sessões do User B
SET request.jwt.claim.sub = '<user-a-id>';
SELECT * FROM device_registration_sessions
WHERE user_id = '<user-b-id>';

-- Resultado esperado: 0 rows
```

**✅ Critérios de Sucesso:**
- [ ] Users não veem sessões de outros
- [ ] RLS bloqueia acesso não autorizado

## 📊 Relatório de Testes

Após executar todos os testes, preencher:

### Resumo

- **Data:** _______________
- **Ambiente:** [ ] Local [ ] Staging [ ] Production
- **Testador:** _______________

### Resultados

| Fase | Testes | Passou | Falhou | Taxa |
|------|--------|--------|--------|------|
| 1. Setup | 6 | ___ | ___ | ___% |
| 2. Unitários | 3 | ___ | ___ | ___% |
| 3. Integração | 4 | ___ | ___ | ___% |
| 4. Edge Cases | 3 | ___ | ___ | ___% |
| 5. Performance | 2 | ___ | ___ | ___% |
| 6. Segurança | 2 | ___ | ___ | ___% |
| **TOTAL** | **20** | ___ | ___ | ___% |

### Issues Encontrados

1. _______________________________________________
2. _______________________________________________
3. _______________________________________________

### Próximos Passos

- [ ] Corrigir issues encontrados
- [ ] Re-testar testes que falharam
- [ ] Deploy para produção
- [ ] Monitorar por 48h

## 🎓 Conclusão

✅ Sistema pronto para produção se:
- Taxa de sucesso > 95%
- Todos testes críticos passaram
- Performance dentro do esperado
- Segurança validada

⚠️ Necessita ajustes se:
- Taxa de sucesso < 95%
- Testes críticos falharam
- Performance inadequada
- Vulnerabilidades detectadas