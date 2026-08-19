export type SeedKeyword = {
  query: string;
  cluster: "name" | "name_topic" | "topic";
};

export type SeedTarget = {
  pattern: string;
  label: string;
  category: "owned" | "authority" | "displacement";
  topics?: string[];
};
