export type Account = {
  id: string;
  companyName: string;
  industry: string;
  created: string;
  status: "Active" | "Pending" | "Inactive";
  prospectPool: number;
  avatarColor: string;
  country: string;
  owner: string;
  ownerEmail: string;
  scope: string;
};

export type AccountInput = {
  companyName: string;
  industry: string;
  country: string;
  owner: string;
  ownerEmail: string;
  scope: string;
  prospectPool?: number;
};
