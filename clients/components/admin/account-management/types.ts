export type Account = {
  id: string;
  username: string;
  password: string;
  companyName: string;
  industry: string;
  created: string;
  status: "Active" | "Pending" | "Inactive";
  prospectPool: number;
  avatarColor: string;
  country: string;
  owner: string;
  scope: string;
};
export type AccountInput = Omit<
  Account,
  "id" | "created" | "status" | "avatarColor"
>;
