// 공개 설정값 (브라우저에 노출되어도 되는 값만 둔다)
export const SUPABASE_URL = "https://ivyhmwpbpkfvbwnckqgv.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_bA2NKNVwDNHqgTS_yLCoZg_n-rsjNyo";

// 토스페이먼츠 테스트 클라이언트 키. 빌드 시 VITE_TOSS_CLIENT_KEY 로 덮어쓴다.
// 기본값은 토스페이먼츠 문서 공개 테스트 키.
export const TOSS_CLIENT_KEY: string = import.meta.env.VITE_TOSS_CLIENT_KEY || "test_ck_D5GePWvyJnrK0W0k6q8gLzN97Eoq";
