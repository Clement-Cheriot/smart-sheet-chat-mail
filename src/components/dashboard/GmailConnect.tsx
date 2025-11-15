import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail, CheckCircle, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const GmailConnect = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [checking, setChecking] = useState(true);
  const [syncProgress, setSyncProgress] = useState<number>(0);
  const popupRef = useRef<Window | null>(null);
  const syncPollingRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    checkGmailConnection();
    
    // Check for OAuth success in URL params (supports hash routing)
    const search = window.location.search || (window.location.hash.includes('?') ? '?' + window.location.hash.split('?')[1] : '');
    const urlParams = new URLSearchParams(search);
    const gmailSuccess = urlParams.get('gmail_success');
    
    if (gmailSuccess === 'true') {
      setIsConnected(true);
      toast.success("Gmail connecté avec succès !");
      // Clean up URL for HashRouter
      window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}#/dashboard`);
    } else if (gmailSuccess === 'false') {
      toast.error("Erreur de connexion Gmail");
      window.history.replaceState({}, '', '/#/dashboard');
    }

    // Cleanup polling on unmount
    return () => {
      if (syncPollingRef.current) {
        clearInterval(syncPollingRef.current);
      }
    };
  }, []);

  const checkGmailConnection = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setIsConnected(false);
        return;
      }
      const { data, error } = await supabase
        .from('user_api_configs')
        .select('gmail_credentials')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (error && (error as any).code !== 'PGRST116') {
        console.error('Error checking Gmail connection:', error);
      }

      const credentials = data?.gmail_credentials as any;
      const isConnected = !!credentials;
      
      // Check if token is expired
      if (isConnected && credentials?.expires_at) {
        const isExpired = Date.now() >= credentials.expires_at;
        if (isExpired) {
          toast.error("Votre connexion Gmail a expiré. Veuillez vous reconnecter.", {
            duration: 5000,
          });
          setIsConnected(false);
          return;
        }
      }

      setIsConnected(isConnected);
    } catch (error) {
      console.error('Error checking Gmail connection:', error);
    } finally {
      setChecking(false);
    }
  };

  // Listen for OAuth popup completion
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e?.data?.type === 'gmail_oauth_complete') {
        setIsConnected(true);
        setIsLoading(false);
        checkGmailConnection();
        try { popupRef.current?.close(); } catch {}
        toast.success("Gmail connecté avec succès !");
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const handleConnectGmail = async () => {
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error("Vous devez être connecté");
        return;
      }

      // Call the edge function to get OAuth URL
      const { data, error } = await supabase.functions.invoke('gmail-oauth-start', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) {
        console.error('Error starting OAuth:', error);
        toast.error("Erreur lors du démarrage de l'autorisation");
        return;
      }

      // Open OAuth in new window (works in iframe context)
      const authWindow = window.open(data.authUrl as string, '_blank', 'width=600,height=700');
      
      if (!authWindow) {
        toast.error("Veuillez autoriser les popups pour ce site");
        return;
      }
      // Keep a reference so we can close it on success
      popupRef.current = authWindow;

      // Poll for connection status
      const pollInterval = setInterval(async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const { data: configData } = await supabase
          .from('user_api_configs')
          .select('gmail_credentials')
          .eq('user_id', session.user.id)
          .maybeSingle();

        if (configData?.gmail_credentials) {
          clearInterval(pollInterval);
          setIsConnected(true);
          toast.success("Gmail connecté avec succès !");
          setIsLoading(false);
          try { popupRef.current?.close(); } catch {}
        }
      }, 2000);

      // Stop polling after 2 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        setIsLoading(false);
      }, 120000);

    } catch (error) {
      console.error('Error connecting Gmail:', error);
      toast.error("Erreur lors de la connexion Gmail");
      setIsLoading(false);
    }
  };

  const handleSyncEmails = async (fullSync = false) => {
    setSyncing(true);
    setSyncProgress(0);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error("Vous devez être connecté");
        return;
      }

      // Get initial count
      const { count: initialCount } = await supabase
        .from('email_history')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', session.user.id);

      toast.info(fullSync ? "Synchronisation complète lancée..." : "Synchronisation rapide lancée...");

      // Start polling for progress
      let lastCount = initialCount || 0;
      syncPollingRef.current = setInterval(async () => {
        const { count: newCount } = await supabase
          .from('email_history')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', session.user.id);
        
        if (newCount && newCount > lastCount) {
          const newEmails = newCount - lastCount;
          setSyncProgress(prev => prev + newEmails);
          toast.info(`${newEmails} nouveaux emails traités...`, { duration: 2000 });
          lastCount = newCount;
        }
      }, 3000);

      // Invoke sync function with longer timeout tolerance
      const syncPromise = supabase.functions.invoke('gmail-sync', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: { userId: session.user.id, fullSync },
      });

      // Add a timeout handler
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('TIMEOUT')), 90000)
      );

      try {
        const { data, error } = await Promise.race([syncPromise, timeoutPromise]) as any;
        
        if (error && error.message !== 'TIMEOUT') throw error;

        // Clear polling
        if (syncPollingRef.current) {
          clearInterval(syncPollingRef.current);
          syncPollingRef.current = null;
        }

        // Get final count
        const { count: finalCount } = await supabase
          .from('email_history')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', session.user.id);

        const totalProcessed = (finalCount || 0) - (initialCount || 0);

        if (data?.reason === 'sync_already_in_progress') {
          toast.warning('Une synchronisation était déjà en cours. Réessayez dans quelques instants.');
        } else {
          toast.success(`✓ Synchronisation terminée : ${totalProcessed} emails traités`);
        }
      } catch (err: any) {
        if (err.message === 'TIMEOUT') {
          // Timeout is OK - sync continues in background
          toast.info("La synchronisation continue en arrière-plan. Les nouveaux emails apparaîtront automatiquement.");
        } else {
          throw err;
        }
      }
    } catch (error: any) {
      console.error('Error syncing emails:', error);
      
      // Clear polling on error
      if (syncPollingRef.current) {
        clearInterval(syncPollingRef.current);
        syncPollingRef.current = null;
      }

      // Provide detailed error message
      if (error.message?.includes('Load failed') || error.message?.includes('Failed to fetch')) {
        toast.error("Erreur de connexion. Vérifiez votre connexion Internet.");
      } else if (error.message?.includes('JWT')) {
        toast.error("Session expirée. Reconnectez-vous à Gmail.");
      } else {
        toast.error("Erreur lors de la synchronisation. Réessayez.");
      }
    } finally {
      setSyncing(false);
      setSyncProgress(0);
      if (syncPollingRef.current) {
        clearInterval(syncPollingRef.current);
        syncPollingRef.current = null;
      }
    }
  };

  const handleDisconnectGmail = async () => {
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Vous devez être connecté");
        return;
      }
      const { error } = await supabase
        .from('user_api_configs')
        .update({ gmail_credentials: null })
        .eq('user_id', session.user.id);
      if (error) throw error;
      setIsConnected(false);
      toast.success("Gmail déconnecté");
    } catch (err) {
      console.error('Error disconnecting Gmail:', err);
      toast.error("Erreur lors de la déconnexion");
    } finally {
      setIsLoading(false);
    }
  };

  if (checking) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Connexion Gmail
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Vérification...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Connexion Gmail
        </CardTitle>
        <CardDescription>
          Connectez votre compte Gmail pour permettre à l'application de gérer vos emails
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isConnected ? (
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle className="h-5 w-5" />
            <span className="font-medium">Gmail connecté</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-amber-600">
            <AlertCircle className="h-5 w-5" />
            <span className="font-medium">Gmail non connecté</span>
          </div>
        )}

        <div className="space-y-2">
          {!isConnected && (
            <Button
              onClick={handleConnectGmail}
              disabled={isLoading}
              className="w-full"
            >
              {isLoading ? "Connexion..." : "Connecter Gmail"}
            </Button>
          )}

          {isConnected && (
            <>
              <Button
                onClick={handleDisconnectGmail}
                disabled={isLoading}
                variant="destructive"
                className="w-full"
              >
                Déconnecter Gmail
              </Button>
              <div className="flex gap-2">
                <Button
                  onClick={() => handleSyncEmails(false)}
                  disabled={syncing}
                  variant="outline"
                  className="flex-1"
                >
                  {syncing && syncProgress > 0 ? `${syncProgress} emails` : syncing ? "Synchronisation..." : "Sync rapide"}
                </Button>
                <Button
                  onClick={() => handleSyncEmails(true)}
                  disabled={syncing}
                  variant="outline"
                  className="flex-1"
                >
                  {syncing && syncProgress > 0 ? `${syncProgress} emails` : syncing ? "Synchronisation..." : "Sync complète"}
                </Button>
              </div>
            </>
          )}

          <p className="text-xs text-muted-foreground">
            En vous connectant, vous autorisez l'application à :
          </p>
          <ul className="text-xs text-muted-foreground space-y-1 ml-4">
            <li>• Lire vos emails</li>
            <li>• Modifier les labels</li>
            <li>• Créer des brouillons</li>
            <li>• Créer des événements dans votre calendrier Google</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};
