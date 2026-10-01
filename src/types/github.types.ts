/*
Shapes of the GitHub REST responses we read with plain fetch().

`await response.json()` is typed `unknown`, so every field access on it
was a TypeScript error (ten of them in connectedRepo.controller alone).
These describe only the fields we actually use — not the full payload.
*/

export type GithubRepoResponse = {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  language: string | null;
  default_branch: string;
  private: boolean;
  html_url: string;
  owner: { login: string } | null;
  // Present on error responses instead of the fields above
  message?: string;
};

export type GithubUserRepo = {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  private: boolean;
  default_branch: string;
  language: string | null;
  html_url: string;
};
