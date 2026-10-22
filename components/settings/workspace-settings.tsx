"use client";

import SetNewPasswordForm from "@/components/forms/set-new-password-form";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import {
  fetchSalesEngineAccount,
  inviteOrganizationMember,
  listOrganizationInvitations,
  listOrganizationMembers,
  removeOrganizationMember,
  resendOrganizationInvitation,
  revokeOrganizationInvitation,
  SalesEngineAuthError,
  updateCurrentOrganization,
  updateOrganizationMember,
  updateSalesEngineProfile,
  type SalesEngineAuthOrganization,
} from "@/lib/api/sales-engine-native-auth";
import { getAuthTokenFromDocument } from "@/lib/auth/session";
import { getSalesEngineToken, setSalesEngineSession } from "@/lib/sales-engine/session";
import { useAuthStore } from "@/store/auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

function tokenOrThrow() {
  const token = getSalesEngineToken() ?? getAuthTokenFromDocument();
  if (!token) throw new SalesEngineAuthError("Sign in again to manage settings.", 401);
  return token;
}

export default function WorkspaceSettings() {
  const queryClient = useQueryClient();
  const setUser = useAuthStore((state) => state.setUser);
  const account = useQuery({
    queryKey: ["sales-engine-account"],
    queryFn: () => fetchSalesEngineAccount(tokenOrThrow()),
  });
  const members = useQuery({
    queryKey: ["sales-engine-members"],
    queryFn: () => listOrganizationMembers(tokenOrThrow()),
  });
  const invitations = useQuery({
    queryKey: ["sales-engine-invitations"],
    queryFn: () => listOrganizationInvitations(tokenOrThrow()),
  });
  const [name, setName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["sales-engine-account"] });
    void queryClient.invalidateQueries({ queryKey: ["sales-engine-members"] });
    void queryClient.invalidateQueries({ queryKey: ["sales-engine-invitations"] });
  };
  const profile = useMutation({
    mutationFn: (file?: File) => updateSalesEngineProfile(tokenOrThrow(), { name: name || account.data?.user.name, avatar: file }),
    onSuccess: (user) => {
      setUser({ id: user.id, name: user.name, email: user.email, avatar: user.avatar_url ?? null, active_company: null });
      toast.success("Profile saved.");
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save the profile."),
  });
  const organization = useMutation({
    mutationFn: () => updateCurrentOrganization(tokenOrThrow(), { name: orgName || account.data?.current_organization?.name }),
    onSuccess: () => {
      toast.success("Organisation saved.");
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save the organisation."),
  });
  const invite = useMutation({
    mutationFn: () => inviteOrganizationMember(tokenOrThrow(), { email: inviteEmail.trim(), role: inviteRole }),
    onSuccess: () => {
      setInviteEmail("");
      toast.success("Invitation sent.");
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not send the invitation."),
  });

  function switchOrganization(org: SalesEngineAuthOrganization) {
    const token = tokenOrThrow();
    setSalesEngineSession(token, org.id);
    toast.success(`Switched to ${org.name}.`);
    window.location.reload();
  }

  const current = account.data?.current_organization;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-8 text-[#0B1215]">
      <header>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-gray-500">Profile, password, organisation, and the people in this workspace.</p>
      </header>

      <section className="rounded-2xl border bg-white p-5">
        <h2 className="mb-3 font-semibold">Profile</h2>
        <div className="flex flex-col gap-3">
          <Input defaultValue={account.data?.user.name ?? ""} placeholder="Name" onChange={(event) => setName(event.target.value)} />
          <label className="text-xs text-gray-500">
            Avatar
            <input
              className="mt-1 block text-sm"
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) profile.mutate(file);
              }}
            />
          </label>
          <Button type="button" disabled={profile.isPending} onClick={() => profile.mutate(undefined)}>Save profile</Button>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-5">
        <h2 className="mb-3 font-semibold">Password</h2>
        <SetNewPasswordForm />
      </section>

      <section className="rounded-2xl border bg-white p-5">
        <h2 className="mb-3 font-semibold">Organisation</h2>
        <div className="flex flex-col gap-3">
          <Input defaultValue={current?.name ?? ""} placeholder="Organisation name" onChange={(event) => setOrgName(event.target.value)} />
          <p className="text-xs text-gray-500">{current?.country ? `Country ${current.country}` : "Country is set during workspace setup."}</p>
          <Button type="button" disabled={organization.isPending} onClick={() => organization.mutate()}>Save organisation</Button>
          <div className="flex flex-wrap gap-2">
            {(account.data?.organizations ?? []).map((org) => (
              <button key={org.id} type="button" className="rounded-full border px-3 py-1 text-xs" onClick={() => switchOrganization(org)}>
                {org.name}{org.id === current?.id ? " · current" : ""}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-5">
        <h2 className="mb-3 font-semibold">Members</h2>
        <ul className="divide-y text-sm">
          {(members.data ?? []).map((member) => (
            <li key={member.id} className="flex items-center justify-between gap-3 py-2">
              <span>{member.name} · {member.email} · {member.role}</span>
              <span className="flex gap-2">
                {member.role !== "owner" ? (
                  <button type="button" className="text-xs underline" onClick={() => updateOrganizationMember(tokenOrThrow(), member.id, member.role === "admin" ? "member" : "admin").then(refresh).catch((error) => toast.error(error.message))}>
                    Make {member.role === "admin" ? "member" : "admin"}
                  </button>
                ) : null}
                <button type="button" className="text-xs text-red-600 underline" onClick={() => removeOrganizationMember(tokenOrThrow(), member.id).then(refresh).catch((error) => toast.error(error.message))}>Remove</button>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border bg-white p-5">
        <h2 className="mb-3 font-semibold">Invitations</h2>
        <form className="mb-4 flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); invite.mutate(); }}>
          <Input type="email" required placeholder="Email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} />
          <select className="rounded-full border px-4" value={inviteRole} onChange={(event) => setInviteRole(event.target.value as "admin" | "member")}>
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
          <Button type="submit" disabled={invite.isPending}>Invite</Button>
        </form>
        <ul className="divide-y text-sm">
          {(invitations.data ?? []).map((invitation) => (
            <li key={invitation.id} className="flex items-center justify-between gap-3 py-2">
              <span>{invitation.email} · {invitation.role}</span>
              <span className="flex gap-2">
                <button type="button" className="text-xs underline" onClick={() => resendOrganizationInvitation(tokenOrThrow(), invitation.id).then(() => toast.success("Invitation resent.")).catch((error) => toast.error(error.message))}>Resend</button>
                <button type="button" className="text-xs text-red-600 underline" onClick={() => revokeOrganizationInvitation(tokenOrThrow(), invitation.id).then(refresh).catch((error) => toast.error(error.message))}>Revoke</button>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
