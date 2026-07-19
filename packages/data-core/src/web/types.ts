export interface CapturedPage {
  url: string;
  html: string;
  status: number;
}

export interface PageFailure {
  url: string;
  reason: string;
}

export interface FetchPageResult {
  page?: CapturedPage;
  failure?: PageFailure;
}
