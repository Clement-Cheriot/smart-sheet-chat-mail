import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, Edit, Upload, Download, Power, Trash, Wand2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { EditRuleDialog } from './EditRuleDialog';

interface Rule {
  id: string;
  sender_pattern: string;
  keywords: string[];
  label_to_apply: string | null;
  priority: string;
  is_active: boolean;
  create_draft: boolean;
  auto_reply: boolean;
  notify_urgent: boolean;
  exclude_newsletters: boolean;
  exclude_marketing: boolean;
  description?: string;
  ruleType?: 'label' | 'draft' | 'auto-reply' | 'notification';
  user_id?: string;
}

export const EmailRules = () => {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      loadRules();
    }
  }, [user]);

  const loadRules = async () => {
    try {
      const { data, error } = await supabase
        .from('email_rules')
        .select('*')
        .eq('user_id', user?.id)
        .order('rule_order', { ascending: true });

      if (error) throw error;
      setRules(data || []);
    } catch (error) {
      console.error('Error loading rules:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleRule = async (ruleId: string, currentState: boolean) => {
    try {
      const { error } = await supabase
        .from('email_rules')
        .update({ is_active: !currentState })
        .eq('id', ruleId);

      if (error) throw error;

      setRules(rules.map(r => 
        r.id === ruleId ? { ...r, is_active: !currentState } : r
      ));

      toast({
        title: 'Règle mise à jour',
        description: `Règle ${!currentState ? 'activée' : 'désactivée'}`,
      });
    } catch (error: any) {
      toast({
        title: 'Erreur',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const exportRules = () => {
    if (rules.length === 0) {
      toast({
        title: 'Aucune règle',
        description: 'Aucune règle à exporter',
        variant: 'destructive',
      });
      return;
    }

    // Format rules for export
    const exportData = rules.map((rule) => {
      // Convert sender_pattern back to domains
      let domains = '';
      if (rule.sender_pattern) {
        const domainMatch = rule.sender_pattern.match(/\((.*?)\)/);
        if (domainMatch) {
          domains = domainMatch[1].replace(/\\\./g, '.').replace(/\|/g, ',');
        }
      }

      return {
        rule_id: rule.id.substring(0, 8),
        classification: rule.label_to_apply || '',
        priority: rule.priority,
        enables: rule.is_active,
        domaines: domains,
        keywords: rule.keywords?.join(',') || '',
        create_draft: rule.create_draft || false,
        auto_reply: rule.auto_reply || false,
        exclude_newsletters: rule.exclude_newsletters !== false,
        exclude_marketing: rule.exclude_marketing !== false,
        description: ''
      };
    });

    // Create workbook and worksheet
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Règles');

    // Set column widths
    worksheet['!cols'] = [
      { wch: 12 }, // rule_id
      { wch: 20 }, // classification
      { wch: 10 }, // priority
      { wch: 10 }, // enables
      { wch: 40 }, // domaines
      { wch: 40 }, // keywords
      { wch: 15 }, // create_draft
      { wch: 15 }, // auto_reply
      { wch: 20 }, // exclude_newsletters
      { wch: 20 }, // exclude_marketing
      { wch: 30 }  // description
    ];

    // Download
    XLSX.writeFile(workbook, `regles_email_${new Date().toISOString().split('T')[0]}.xlsx`);
    
    toast({
      title: 'Export réussi',
      description: `${rules.length} règle(s) exportée(s)`,
    });
  };

  const downloadTemplate = () => {
    // Create template data
    const templateData = [
      {
        rule_id: 'rule_001',
        classification: 'Trading Urgent',
        priority: 'high',
        enables: true,
        domaines: 'binance.com,bitget.com,coinbase.com',
        keywords: 'liquidation,margin,withdraw',
        create_draft: false,
        auto_reply: false,
        exclude_newsletters: true,
        exclude_marketing: true,
        description: 'Alertes trading urgentes'
      },
      {
        rule_id: 'rule_002',
        classification: 'Newsletter',
        priority: 'low',
        enables: true,
        domaines: 'newsletter.com,marketing.com',
        keywords: 'newsletter,abonnement',
        create_draft: false,
        auto_reply: false,
        exclude_newsletters: true,
        exclude_marketing: true,
        description: 'Newsletters marketing'
      }
    ];

    // Create workbook and worksheet
    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Règles');

    // Set column widths
    worksheet['!cols'] = [
      { wch: 12 }, // rule_id
      { wch: 20 }, // classification
      { wch: 10 }, // priority
      { wch: 10 }, // enables
      { wch: 40 }, // domaines
      { wch: 40 }, // keywords
      { wch: 15 }, // create_draft
      { wch: 15 }, // auto_reply
      { wch: 20 }, // exclude_newsletters
      { wch: 20 }, // exclude_marketing
      { wch: 30 }  // description
    ];

    // Download
    XLSX.writeFile(workbook, 'template_regles_email.xlsx');
    
    toast({
      title: 'Template téléchargé',
      description: 'Remplissez le fichier et importez-le',
    });
  };

  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      // Format: rule_id, classification, priority, enables, domaines, keywords, create_draft, auto_reply, exclude_newsletters, exclude_marketing, description
      const newRules = jsonData.map((row: any, index: number) => {
        // Parse domaines (comma-separated string)
        const domains = row.domaines ? row.domaines.split(',').map((d: string) => d.trim()).filter(Boolean) : [];
        
        // Parse keywords (comma-separated string)
        const keywords = row.keywords ? row.keywords.split(',').map((k: string) => k.trim()).filter(Boolean) : [];

        // Convert domains to sender_pattern regex
        let senderPattern = null;
        if (domains.length > 0) {
          const domainsPattern = domains.map((d: string) => d.replace(/\./g, '\\.')).join('|');
          senderPattern = `.*@(${domainsPattern})`;
        }

        return {
          user_id: user?.id,
          sender_pattern: senderPattern,
          keywords: keywords,
          label_to_apply: row.classification || 'Imported',
          priority: row.priority?.toLowerCase() || 'medium',
          is_active: row.enables === true || row.enables === 'true' || row.enables === 1,
          create_draft: row.create_draft === true || row.create_draft === 'true' || row.create_draft === 1,
          auto_reply: row.auto_reply === true || row.auto_reply === 'true' || row.auto_reply === 1,
          exclude_newsletters: row.exclude_newsletters !== false && row.exclude_newsletters !== 'false' && row.exclude_newsletters !== 0,
          exclude_marketing: row.exclude_marketing !== false && row.exclude_marketing !== 'false' && row.exclude_marketing !== 0,
          rule_order: index,
        };
      });

      // Detect duplicates
      const existingRules = rules;
      const duplicates: string[] = [];
      const uniqueRules = newRules.filter((newRule) => {
        const isDuplicate = existingRules.some((existing) => {
          // Check if sender_pattern and keywords match
          const senderMatch = newRule.sender_pattern === existing.sender_pattern;
          const keywordsMatch = JSON.stringify(newRule.keywords?.sort()) === JSON.stringify(existing.keywords?.sort());
          const labelMatch = newRule.label_to_apply === existing.label_to_apply;
          
          return senderMatch && keywordsMatch && labelMatch;
        });
        
        if (isDuplicate) {
          duplicates.push(newRule.label_to_apply || 'Sans label');
        }
        
        return !isDuplicate;
      });

      if (uniqueRules.length === 0) {
        toast({
          title: 'Aucune nouvelle règle',
          description: 'Toutes les règles importées existent déjà',
          variant: 'destructive',
        });
        return;
      }

      const { error } = await supabase
        .from('email_rules')
        .insert(uniqueRules);

      if (error) throw error;

      const message = duplicates.length > 0
        ? `${uniqueRules.length} règle(s) importée(s), ${duplicates.length} doublon(s) ignoré(s)`
        : `${uniqueRules.length} règle(s) importée(s)`;

      toast({
        title: 'Import réussi',
        description: message,
      });

      loadRules();
    } catch (error: any) {
      console.error('Import error:', error);
      toast({
        title: 'Erreur d\'import',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const deleteRule = async (ruleId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette règle ?')) return;
    
    try {
      const { error } = await supabase
        .from('email_rules')
        .delete()
        .eq('id', ruleId);

      if (error) throw error;

      setRules(rules.filter(r => r.id !== ruleId));
      toast({
        title: 'Règle supprimée',
        description: 'La règle a été supprimée avec succès',
      });
    } catch (error: any) {
      toast({
        title: 'Erreur',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const createExampleRules = async () => {
    const baseOrder = rules.length;
    const exampleRules = [
      {
        user_id: user?.id,
        label_to_apply: 'Newsletter',
        keywords: ['newsletter', 'actualités', 'abonnement'],
        priority: 'low',
        auto_reply: false,
        create_draft: false,
        notify_urgent: false,
        is_active: true,
        exclude_newsletters: true,
        exclude_marketing: true,
        rule_order: baseOrder
      },
      {
        user_id: user?.id,
        label_to_apply: 'Facturation',
        keywords: ['facture', 'paiement', 'montant dû'],
        priority: 'high',
        is_active: true,
        exclude_newsletters: true,
        exclude_marketing: true,
        rule_order: baseOrder + 1
      }
    ];

    try {
      const { error } = await supabase
        .from('email_rules')
        .insert(exampleRules);

      if (error) throw error;

      await loadRules();
      toast({
        title: 'Règles créées',
        description: `${exampleRules.length} règle(s) d'exemple créée(s) avec succès`,
      });
    } catch (error: any) {
      toast({
        title: 'Erreur',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const clearAllRules = async () => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer toutes les règles ?')) return;
    
    try {
      const { error } = await supabase
        .from('email_rules')
        .delete()
        .eq('user_id', user?.id);

      if (error) throw error;

      setRules([]);
      toast({
        title: 'Règles supprimées',
        description: 'Toutes les règles ont été supprimées',
      });
    } catch (error: any) {
      toast({
        title: 'Erreur',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const getPriorityColor = (priority: string): "default" | "destructive" | "outline" | "secondary" => {
    switch (priority) {
      case 'high':
        return 'destructive';
      case 'medium':
        return 'default';
      default:
        return 'secondary';
    }
  };

  const renderRulesList = (filteredRules: Rule[]) => {
    if (filteredRules.length === 0) {
      return (
        <div className="text-center py-12 border-2 border-dashed rounded-lg">
          <p className="text-muted-foreground mb-4">Aucune règle dans cette catégorie</p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {filteredRules.map((rule) => (
          <div
            key={rule.id}
            className="p-4 border rounded-lg hover:bg-accent/50 transition-colors"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <Badge variant={rule.is_active ? 'default' : 'secondary'}>
                    {rule.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                  <Badge variant={getPriorityColor(rule.priority)}>
                    {rule.priority}
                  </Badge>
                  {rule.create_draft && (
                    <Badge variant="outline" className="text-blue-600 border-blue-600">
                      Brouillon
                    </Badge>
                  )}
                  {rule.auto_reply && (
                    <Badge variant="outline" className="text-green-600 border-green-600">
                      Réponse auto
                    </Badge>
                  )}
                  {rule.notify_urgent && (
                    <Badge variant="outline" className="text-red-600 border-red-600">
                      Notification urgente
                    </Badge>
                  )}
                </div>
                <p className="font-medium mb-1">
                  Expéditeur : {rule.sender_pattern || 'Tous'}
                </p>
                {rule.keywords && rule.keywords.length > 0 && (
                  <p className="text-sm text-muted-foreground mb-2">
                    Mots-clés : {rule.keywords.join(', ')}
                  </p>
                )}
                {rule.label_to_apply && (
                  <p className="text-sm mb-1">
                    Label : <span className="font-medium">{rule.label_to_apply}</span>
                  </p>
                )}
                {(rule.create_draft || rule.auto_reply) && (rule.exclude_newsletters || rule.exclude_marketing) && (
                  <p className="text-xs text-muted-foreground">
                    Exclusions : {[
                      rule.exclude_newsletters && 'Newsletters',
                      rule.exclude_marketing && 'Marketing'
                    ].filter(Boolean).join(', ')}
                  </p>
                )}
                {rule.description && rule.description.trim() && (
                  <div className="mt-2 p-2 bg-muted/50 rounded text-xs">
                    <p className="font-medium mb-1">📚 Description enrichie (auto-apprentissage):</p>
                    <p className="text-muted-foreground whitespace-pre-wrap">{rule.description}</p>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => toggleRule(rule.id, rule.is_active)}
                  title={rule.is_active ? 'Désactiver' : 'Activer'}
                >
                  <Power className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setEditingRule({ ...rule, ruleType: 'label' })}
                  title="Modifier"
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => deleteRule(rule.id)}
                  title="Supprimer"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Chargement...</div>;
  }

  const labelRules = rules.filter(r => r.label_to_apply && !r.create_draft && !r.auto_reply);

  const clearAllLabelRules = async () => {
    if (labelRules.length === 0) return;
    
    if (!confirm(`Êtes-vous sûr de vouloir supprimer toutes les règles de label (${labelRules.length} règles) ?`)) return;
    
    try {
      const { error } = await supabase
        .from('email_rules')
        .delete()
        .in('id', labelRules.map(r => r.id));

      if (error) throw error;

      await loadRules();
      toast({
        title: 'Règles supprimées',
        description: `${labelRules.length} règles ont été supprimées`,
      });
    } catch (error: any) {
      toast({
        title: 'Erreur',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Gérez vos règles de labels pour la catégorisation automatique des emails. La priorité (high/medium/low) influence le score de l'email.
      </p>

      <div className="flex gap-2 mb-4">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileImport}
          className="hidden"
        />
        <Button 
          onClick={() => setEditingRule({ user_id: user?.id, ruleType: 'label' } as any)}
          size="sm"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nouvelle règle
        </Button>
        <Button 
          variant="outline" 
          onClick={createExampleRules}
          size="sm"
        >
          <Wand2 className="h-4 w-4 mr-2" />
          Créer des exemples
        </Button>
        <Button 
          variant="outline" 
          onClick={downloadTemplate}
          size="sm"
        >
          <Download className="h-4 w-4 mr-2" />
          Template Excel
        </Button>
        <Button 
          variant="outline" 
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
          size="sm"
        >
          <Upload className="h-4 w-4 mr-2" />
          {importing ? 'Import...' : 'Importer Excel'}
        </Button>
        <Button 
          variant="outline" 
          onClick={exportRules}
          size="sm"
        >
          <Download className="h-4 w-4 mr-2" />
          Exporter règles
        </Button>
        <Button 
          variant="destructive" 
          onClick={clearAllLabelRules}
          size="sm"
        >
          <Trash className="h-4 w-4 mr-2" />
          Supprimer tout
        </Button>
      </div>

      {renderRulesList(labelRules)}

      {editingRule && (
        <EditRuleDialog
          open={!!editingRule}
          onOpenChange={(open) => !open && setEditingRule(null)}
          rule={editingRule}
          onSuccess={loadRules}
          ruleType="label"
        />
      )}
    </div>
  );
};
