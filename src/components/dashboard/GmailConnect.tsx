import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail, CheckCircle, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const GmailConnect = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    checkGmailConnection();
    
    // Check for OAuth success in URL params
    const urlParams = new URLSearchParams(window.location.search);
    const gmailSuccess = urlParams.get('gmail_success');
    
    if (gmailSuccess === 'true') {
      setIsConnected(true);
      toast.success("Gmail connecté avec succès !");
      // Clean up URL
      window.history.replaceState({}, '', '/dashboard');
    } else if (gmailSuccess === 'false') {
      toast.error("Erreur de connexion Gmail");
      window.history.replaceState({}, '', '/dashboard');
    }
  }, []);

  const checkGmailConnection = async () => {
    try {
      const { data, error } = await supabase
        .from('user_api_configs')
        .select('gmail_credentials')
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error checking Gmail connection:', error);
      }

      setIsConnected(!!data?.gmail_credentials);
    } catch (error) {
      console.error('Error checking Gmail connection:', error);
    } finally {
      setChecking(false);
    }
  };

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

      // Redirect directly to OAuth URL (no popup to avoid COOP issues)
      window.location.href = data.authUrl;
    } catch (error) {
      console.error('Error connecting Gmail:', error);
      toast.error("Erreur lors de la connexion Gmail");
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
          <Button
            onClick={handleConnectGmail}
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? "Connexion..." : isConnected ? "Reconnecter Gmail" : "Connecter Gmail"}
          </Button>

          <p className="text-xs text-muted-foreground">
            En vous connectant, vous autorisez l'application à :
          </p>
          <ul className="text-xs text-muted-foreground space-y-1 ml-4">
            <li>• Lire vos emails</li>
            <li>• Modifier les labels</li>
            <li>• Créer des brouillons</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};
