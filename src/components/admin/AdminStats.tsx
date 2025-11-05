import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Mail, CheckCircle, AlertCircle, Tag, Calendar } from 'lucide-react';

export const AdminStats = () => {
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalEmails: 0,
    successfulActions: 0,
    errors: 0,
    totalRules: 0,
    calendarEvents: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const [users, emails, successLogs, errorLogs, rules, calendarLogs] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('email_history').select('id', { count: 'exact', head: true }),
        supabase.from('activity_logs').select('id', { count: 'exact', head: true }).eq('status', 'success'),
        supabase.from('activity_logs').select('id', { count: 'exact', head: true }).eq('status', 'error'),
        supabase.from('email_rules').select('id', { count: 'exact', head: true }),
        supabase.from('activity_logs').select('id', { count: 'exact', head: true }).eq('action_type', 'calendar_event_created'),
      ]);

      setStats({
        totalUsers: users.count || 0,
        totalEmails: emails.count || 0,
        successfulActions: successLogs.count || 0,
        errors: errorLogs.count || 0,
        totalRules: rules.count || 0,
        calendarEvents: calendarLogs.count || 0,
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      title: 'Utilisateurs totaux',
      value: stats.totalUsers,
      icon: Users,
      color: 'text-primary',
    },
    {
      title: 'Emails traités',
      value: stats.totalEmails,
      icon: Mail,
      color: 'text-accent',
    },
    {
      title: 'Règles créées',
      value: stats.totalRules,
      icon: Tag,
      color: 'text-info',
    },
    {
      title: 'Événements calendrier',
      value: stats.calendarEvents,
      icon: Calendar,
      color: 'text-success',
    },
    {
      title: 'Actions réussies',
      value: stats.successfulActions,
      icon: CheckCircle,
      color: 'text-success',
    },
    {
      title: 'Erreurs',
      value: stats.errors,
      icon: AlertCircle,
      color: 'text-destructive',
    },
  ];

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Chargement...</div>;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {statCards.map((stat) => (
        <Card key={stat.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {stat.title}
            </CardTitle>
            <stat.icon className={`h-4 w-4 ${stat.color}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
