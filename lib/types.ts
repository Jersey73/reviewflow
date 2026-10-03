export type Business = {
  id: string;
  name: string;
  slug: string;
  logo_url?: string | null;
  google_review_url: string;
  description?: string | null;
  keywords?: string[] | null;
};