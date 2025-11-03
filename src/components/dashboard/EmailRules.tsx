import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, Edit, Upload, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

interface Rule {
  id: string;
  sender_pattern: string;
  keywords: string[];
  label_to_apply: string;
  priority: string;
  is_active: boolean;
}

export const EmailRules = () => {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
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

  const downloadTemplate = () => {
    // Create template data
    const templateData = [
      {
        rule_id: 'rule_001',
        classification: 'Trading Urgent',
        priority: 'high',
        enables: true,
        conditions: '{"domains":["binance.com","bitget.com","coinbase.com"],"keywords":["liquidation","margin","withdraw"]}',
        description: 'Alertes trading urgentes'
      },
      {
        rule_id: 'rule_002',
        classification: 'Newsletter',
        priority: 'low',
        enables: true,
        conditions: '{"domains":["newsletter.com","marketing.com"],"keywords":["newsletter","abonnement"]}',
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
      { wch: 60 }, // conditions
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

      // Format: rule_id, classification, priority, enables, conditions, description
      const newRules = jsonData.map((row: any, index: number) => {
        let conditions: any = {};
        try {
          conditions = typeof row.conditions === 'string' ? JSON.parse(row.conditions) : row.conditions || {};
        } catch (e) {
          console.error('Error parsing conditions for row:', row, e);
        }

        // Convert domains array to sender_pattern regex
        let senderPattern = null;
        if (conditions.domains && conditions.domains.length > 0) {
          const domainsPattern = conditions.domains.map((d: string) => d.replace('.', '\\.')).join('|');
          senderPattern = `.*@(${domainsPattern})`;
        }

        return {
          user_id: user?.id,
          sender_pattern: senderPattern,
          keywords: conditions.keywords || [],
          label_to_apply: row.classification || 'Imported',
          priority: row.priority?.toLowerCase() || 'medium',
          auto_action: null, // L'IA décide
          is_active: row.enables === true || row.enables === 'true' || row.enables === 1,
          rule_order: index,
        };
      });

      const { error } = await supabase
        .from('email_rules')
        .insert(newRules);

      if (error) throw error;

      toast({
        title: 'Import réussi',
        description: `${newRules.length} règles importées`,
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

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Chargement...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          Gérez vos règles d'automatisation d'emails
        </p>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileImport}
            className="hidden"
          />
          <Button 
            variant="outline" 
            onClick={downloadTemplate}
          >
            <Download className="mr-2 h-4 w-4" />
            Template
          </Button>
          <Button 
            variant="outline" 
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            <Upload className="mr-2 h-4 w-4" />
            {importing ? 'Import...' : 'Importer'}
          </Button>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Nouvelle règle
          </Button>
        </div>
      </div>

      {rules.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed rounded-lg">
          <p className="text-muted-foreground mb-4">Aucune règle configurée</p>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Créer ma première règle
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="p-4 border rounded-lg hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant={rule.is_active ? 'default' : 'secondary'}>
                      {rule.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                    <Badge variant={getPriorityColor(rule.priority)}>
                      {rule.priority}
                    </Badge>
                  </div>
                  <p className="font-medium mb-1">
                    Expéditeur : {rule.sender_pattern || 'Tous'}
                  </p>
                  {rule.keywords && rule.keywords.length > 0 && (
                    <p className="text-sm text-muted-foreground mb-2">
                      Mots-clés : {rule.keywords.join(', ')}
                    </p>
                  )}
                  <p className="text-sm">
                    Label : <span className="font-medium">{rule.label_to_apply}</span>
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => toggleRule(rule.id, rule.is_active)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
