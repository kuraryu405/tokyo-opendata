type LocalBindingInputs = {
  d1Binding?: string;
  r2Binding?: string;
  remoteAi: boolean;
};

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

export function createLocalBindingConfig({ d1Binding, r2Binding, remoteAi }: LocalBindingInputs) {
  return {
    main: "./worker/index.ts",
    compatibility_flags: ["nodejs_compat"],
    workers_dev: true,
    preview_urls: false,
    ...(remoteAi ? { ai: { binding: "AI", remote: true } } : {}),
    ratelimits: [
      {
        name: "SUPPORT_CHAT_RATE_LIMITER",
        namespace_id: "202608230020",
        simple: { limit: 20, period: 60 },
      },
    ],
    d1_databases: d1Binding
      ? [
          {
            binding: d1Binding,
            database_name: "site-creator-d1",
            database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
          },
        ]
      : [],
    r2_buckets: r2Binding
      ? [
          {
            binding: r2Binding,
            bucket_name: "site-creator-r2",
          },
        ]
      : [],
  };
}
