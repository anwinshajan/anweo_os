// Client names the signed-in staff member is allowed to see: every client for managers/admin,
// only the ones they have been given work on for everyone else. Names only, never contact details.
export type ClientName = { id: string; business_name: string; status: string };

export async function visibleClients(sb: { rpc: (fn: string) => PromiseLike<{ data: unknown }> }): Promise<ClientName[]> {
  const { data } = await sb.rpc("visible_clients");
  return (data ?? []) as ClientName[];
}

export const nameMap = (list: ClientName[]) => new Map(list.map((c) => [c.id, c.business_name]));
