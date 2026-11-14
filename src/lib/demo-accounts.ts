export const DEMO_ACCOUNTS = [
  { roleKey: "home.demoAdmin", username: "admin", password: "Admin1234" },
  { roleKey: "home.demoMember", username: "max", password: "User1234" },
  { roleKey: "home.demoTennis", username: "tennis", password: "Tennis1234" },
  { roleKey: "home.demoFootball", username: "fussball", password: "Fussball1" },
  { roleKey: "home.demoFootballMember", username: "anna", password: "Anna1234" },
] as const;

export function findDemoAccount(username: string) {
  const normalized = username.trim().toLowerCase();
  return DEMO_ACCOUNTS.find((account) => account.username === normalized) ?? null;
}
