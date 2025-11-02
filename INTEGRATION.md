# Guide d'intégration Email Manager AI

## Architecture du système

Email Manager AI remplace complètement n8n avec des Edge Functions natives dans Lovable Cloud.

### 🏗️ Composants principaux

1. **email-processor** - Traitement principal des emails entrants
2. **whatsapp-sender** - Envoi de notifications WhatsApp
3. **gmail-actions** - Actions Gmail (labels, brouillons)
4. **email-summary** - Génération de résumés automatiques
5. **sync-sheets-rules** - Synchronisation des règles depuis Google Sheets

## 📡 Configuration des Webhooks Gmail

### Option 1 : Gmail API Push Notifications

1. Accédez à la [Google Cloud Console](https://console.cloud.google.com/)
2. Activez l'API Gmail
3. Créez un Topic Pub/Sub pour les notifications Gmail
4. Configurez le webhook :

```bash
POST https://gmail.googleapis.com/gmail/v1/users/me/watch
Content-Type: application/json
Authorization: Bearer YOUR_ACCESS_TOKEN

{
  "topicName": "projects/YOUR_PROJECT/topics/gmail-push",
  "labelIds": ["INBOX"]
}
```

5. Configurez Pub/Sub pour appeler votre Edge Function `email-processor`

### Option 2 : Service tiers (Zapier, Make.com)

Si vous n'avez pas configuré Gmail API directement :

1. Utilisez Zapier ou Make.com comme pont
2. Configurez un trigger "New Email in Gmail"
3. Action : Webhook POST vers votre URL `email-processor`

```
URL: https://bqnzofttwsuxcucbyxov.supabase.co/functions/v1/email-processor
Method: POST
Body:
{
  "userId": "USER_UUID",
  "messageId": "{{gmail_message_id}}",
  "sender": "{{from_email}}",
  "subject": "{{subject}}",
  "body": "{{body}}",
  "receivedAt": "{{received_at}}"
}
```

## 🔐 Configuration WhatsApp Business API

### Prérequis
- Compte Meta Business vérifié
- Numéro de téléphone WhatsApp Business
- Token d'API WhatsApp

### Configuration dans l'app

1. Connectez-vous au dashboard
2. Allez dans "Configuration"
3. Renseignez :
   - WhatsApp API Token
   - WhatsApp Phone Number ID

### Test d'envoi

```bash
curl -X POST https://bqnzofttwsuxcucbyxov.supabase.co/functions/v1/whatsapp-sender \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "YOUR_USER_UUID",
    "type": "alert",
    "message": "Test notification"
  }'
```

## 📊 Google Sheets - Format des règles

Créez un Google Sheet avec cette structure :

| sender_pattern | keywords | label_to_apply | priority | auto_action | response_template |
|---------------|----------|----------------|----------|-------------|-------------------|
| .*@client\.com | urgent,important | Clients | high | create_draft | Merci pour votre message... |
| .*@newsletter\. | promo,offre | Marketing | low | | |

### Colonnes expliquées

- **sender_pattern** : Regex pour matcher l'expéditeur
- **keywords** : Mots-clés séparés par des virgules
- **label_to_apply** : Label Gmail à appliquer
- **priority** : low / medium / high
- **auto_action** : create_draft (optionnel)
- **response_template** : Template pour les brouillons

### Synchronisation

Utilisez la fonction `sync-sheets-rules` :

```bash
curl -X POST https://bqnzofttwsuxcucbyxov.supabase.co/functions/v1/sync-sheets-rules \
  -H "Content-Type: application/json" \
  -d '{"userId": "YOUR_USER_UUID"}'
```

## 🤖 Analyse IA

Le système utilise **Lovable AI** (Google Gemini 2.5 Flash) pour :

- Analyser le sentiment de l'email
- Détecter l'urgence
- Catégoriser automatiquement
- Extraire les entités importantes
- Suggérer des actions

Aucune configuration supplémentaire nécessaire - l'API key est pré-configurée.

## 📅 Résumés automatiques

### Résumé quotidien (recommandé : 8h et 18h)

```bash
curl -X POST https://bqnzofttwsuxcucbyxov.supabase.co/functions/v1/email-summary \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "YOUR_USER_UUID",
    "period": "daily"
  }'
```

### Résumé hebdomadaire (recommandé : lundi 9h)

```bash
curl -X POST https://bqnzofttwsuxcucbyxov.supabase.co/functions/v1/email-summary \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "YOUR_USER_UUID",
    "period": "weekly"
  }'
```

## 🔄 Configuration d'un CRON

### Via service externe (recommandé)

Utilisez [cron-job.org](https://cron-job.org) ou similaire :

1. Créez un job CRON
2. URL : `https://bqnzofttwsuxcucbyxov.supabase.co/functions/v1/email-summary`
3. Méthode : POST
4. Body : `{"userId": "UUID", "period": "daily"}`
5. Schedule : `0 8,18 * * *` (8h et 18h)

### Via Supabase pg_cron (avancé)

Si vous avez accès au SQL Supabase :

```sql
SELECT cron.schedule(
  'daily-summary-morning',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url:='https://bqnzofttwsuxcucbyxov.supabase.co/functions/v1/email-summary',
    headers:='{"Content-Type": "application/json"}'::jsonb,
    body:='{"userId": "USER_UUID", "period": "daily"}'::jsonb
  ) as request_id;
  $$
);
```

## 🎯 Flux complet de traitement

1. **Email reçu** → Webhook Gmail déclenché
2. **email-processor** → Analyse IA + matching règles
3. **gmail-actions** → Application label + création brouillon
4. **whatsapp-sender** → Notification si priorité haute
5. **email_history** → Sauvegarde en base de données

## 🧪 Testing

Utilisez l'onglet "Webhooks" dans le dashboard pour :

- Tester le traitement d'emails
- Copier l'URL du webhook
- Synchroniser les règles Google Sheets
- Vérifier que tout fonctionne

## 🛡️ Sécurité

- ✅ Toutes les Edge Functions sont publiques (verify_jwt = false)
- ✅ Les clés API sont stockées chiffrées dans la base
- ✅ RLS activé sur toutes les tables
- ✅ Logs d'activité pour audit
- ✅ Validation côté serveur

## 📚 URLs des Edge Functions

```
Email Processor:    https://bqnzofttwsuxcucbyxov.supabase.co/functions/v1/email-processor
WhatsApp Sender:    https://bqnzofttwsuxcucbyxov.supabase.co/functions/v1/whatsapp-sender
Gmail Actions:      https://bqnzofttwsuxcucbyxov.supabase.co/functions/v1/gmail-actions
Email Summary:      https://bqnzofttwsuxcucbyxov.supabase.co/functions/v1/email-summary
Sync Sheets Rules:  https://bqnzofttwsuxcucbyxov.supabase.co/functions/v1/sync-sheets-rules
```

## 💡 Prochaines étapes

1. ✅ Créer votre compte sur l'app
2. ✅ Configurer vos clés API (WhatsApp, Google Sheets ID)
3. ✅ Créer vos règles dans Google Sheets
4. ✅ Synchroniser les règles
5. ✅ Configurer le webhook Gmail
6. ✅ Tester avec l'outil de test intégré
7. ✅ Configurer les résumés automatiques (CRON)

---

**Support** : Pour toute question, contactez l'administrateur système.
