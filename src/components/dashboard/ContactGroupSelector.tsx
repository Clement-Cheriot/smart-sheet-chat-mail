import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Contact {
  id: string;
  email: string;
  name: string | null;
}

interface ContactGroup {
  id: string;
  name: string;
}

interface ContactGroupSelectorProps {
  googleContactId: string | null;
  contactGroupId: string | null;
  onContactChange: (googleContactId: string | null) => void;
  onGroupChange: (groupId: string | null) => void;
}

export const ContactGroupSelector = ({ 
  googleContactId, 
  contactGroupId, 
  onContactChange, 
  onGroupChange 
}: ContactGroupSelectorProps) => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<ContactGroup[]>([]);

  useEffect(() => {
    fetchContacts();
    fetchGroups();
  }, []);

  const fetchContacts = async () => {
    const { data } = await supabase
      .from("google_contacts")
      .select("id, email, name")
      .order("name", { ascending: true });
    setContacts(data || []);
  };

  const fetchGroups = async () => {
    const { data } = await supabase
      .from("contact_groups")
      .select("id, name")
      .order("name", { ascending: true });
    setGroups(data || []);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Contact spécifique</Label>
        <Select 
          value={googleContactId || "none"} 
          onValueChange={(value) => {
            onContactChange(value === "none" ? null : value);
            if (value !== "none") onGroupChange(null);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Aucun contact spécifique" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Aucun contact spécifique</SelectItem>
            {contacts.map(contact => (
              <SelectItem key={contact.id} value={contact.id}>
                {contact.name || contact.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Groupe de contacts</Label>
        <Select 
          value={contactGroupId || "none"}
          onValueChange={(value) => {
            onGroupChange(value === "none" ? null : value);
            if (value !== "none") onContactChange(null);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Aucun groupe" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Aucun groupe</SelectItem>
            {groups.map(group => (
              <SelectItem key={group.id} value={group.id}>
                {group.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!googleContactId && !contactGroupId && (
        <p className="text-xs text-muted-foreground">
          Ou utilisez le champ "Expéditeur" ci-dessus pour un pattern d'email
        </p>
      )}
    </div>
  );
};
