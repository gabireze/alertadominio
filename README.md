# Monitor de Domínios

Sistema de monitoramento automático de disponibilidade de domínios .br e .com com notificações via Telegram.

## GitAds Sponsored
[![Sponsored by GitAds](https://gitads.dev/v1/ad-serve?source=gabireze/alertadominio@github)](https://gitads.dev/v1/ad-track?source=gabireze/alertadominio@github)

## Funcionalidades

- Monitoramento de domínios .br e .com
- Notificações em tempo real via Telegram
- Verificação periódica a cada minuto
- Alertas apenas durante janela de horário específica (14:50 - 15:10)
- Detecção de mudanças de status
- Extração de datas de liberação para domínios .br

## Configuração

1. Instale as dependências:
```bash
npm install
```

2. Configure o arquivo `.env` com suas credenciais:
```
TELEGRAM_BOT_TOKEN=seu_token_aqui
TELEGRAM_CHAT_ID=seu_chat_id_aqui
DOMAINS=dominio1.com.br,dominio2.com
```

3. Execute o monitor:
```bash
npm start
```

## Variáveis de Ambiente

- `TELEGRAM_BOT_TOKEN`: Token do bot do Telegram
- `TELEGRAM_CHAT_ID`: ID do chat para receber notificações
- `DOMAINS`: Lista de domínios separados por vírgula

## Status de Alerta

### Domínios .br
- Status 0: Disponível
- Status 5: Em processo de liberação
- Status 6: Em processo de liberação
- Status 7: Em processo de liberação
- Status 9: Em processo de liberação

### Domínios .com
- Status 0: Disponível

## Estrutura do Projeto

- `monitor.js`: Script principal de monitoramento
- `isavail.js`: Verificação de domínios .br
- `whois.js`: Verificação de domínios .com
- `.env`: Configurações e credenciais

## Notificações

O bot envia duas tipos de mensagens:

1. Status inicial ao iniciar, listando todos os domínios monitorados
2. Alertas quando há mudança de status para estados específicos durante a janela de monitoramento

<!-- GitAds-Verify: GKLKZIAJM782I7QX3TAODX1Z2GGTI4G4 -->
