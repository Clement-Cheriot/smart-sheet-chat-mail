-- Add ai_categorization_rules column to user_api_configs table
ALTER TABLE public.user_api_configs 
ADD COLUMN IF NOT EXISTS ai_categorization_rules text DEFAULT '## Instructions de Catégorisation

Tu dois OBLIGATOIREMENT attribuer exactement 2 labels à chaque email :
1. **UN label de catégorie** (ex: "Travail/Projets", "Personnel/Famille", "Finance/Banque")
2. **UN label d''action** qui commence par "Actions/" (ex: "Actions/À Répondre", "Actions/À Lire", "Actions/Archiver")

### Labels de Catégorie Disponibles
- Travail/Projets
- Travail/Réunions
- Personnel/Famille
- Personnel/Loisirs
- Finance/Banque
- Finance/Factures
- Achats/Commandes
- Achats/Confirmations
- Newsletter/Tech
- Newsletter/Marketing
- Administratif/Impôts
- Administratif/Assurances

### Labels d''Action Disponibles
- Actions/Urgent (nécessite une réponse dans les 24h)
- Actions/À Répondre (nécessite une réponse)
- Actions/À Lire (information importante à lire)
- Actions/En Attente (attente d''une réponse/action externe)
- Actions/Archiver (email informatif, pas d''action requise)
- Actions/Supprimer (spam, newsletter non désirée)

### Règles de Priorité
- Score 9-10 : Urgent ET important (facture impayée, deadline proche, problème critique)
- Score 7-8 : Important mais pas urgent (projet en cours, information importante)
- Score 5-6 : Normal (emails quotidiens, confirmations)
- Score 3-4 : Faible priorité (newsletters, promotions)
- Score 1-2 : Très faible (spam, marketing non sollicité)

### Validation
- Si aucune catégorie ne correspond → "Needs Manual Review"
- Si aucune action ne correspond → "Actions/Revue Manuelle"
- TOUJOURS retourner exactement 2 labels'::text;