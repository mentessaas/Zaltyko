// linux/amd64 metadata observed 2026-10-15; Supabase CLI 2.84.2.
export const LOCAL_E2E_DIGEST_PINS = [
  {
    ecr: "public.ecr.aws/supabase/postgres:17.6.1.095",
    hub: "supabase/postgres",
    manifest:
      "sha256:4c087262afbfbb47da86e2863a52d7e424eb21ab589f732d77eeaab51be8e521",
    config:
      "sha256:972aabc75779f6e535f87e1669f36edbab02cdf8bf3f47d13579963c119adefb",
  },
  {
    ecr: "public.ecr.aws/supabase/gotrue:v2.188.1",
    hub: "supabase/gotrue",
    manifest:
      "sha256:61f1099e790c4f364b70d6fb92cc07e5f90275abf2cf690ff045c63f1d96ee4b",
    config:
      "sha256:b061f1fa636f31bc01de0a791986352e82772760cce8e1d55bbec6f552930a1e",
  },
  {
    ecr: "public.ecr.aws/supabase/realtime:v2.78.18",
    hub: "supabase/realtime",
    manifest:
      "sha256:31dee2e8dd02be5fb86b618fcaa9a998ab4774cba530fffe9e269a053ab498cd",
    config:
      "sha256:2a6ccc982af0225215a8f65bf0cbd204602bcb3d7054a749fe35ae21151e9881",
  },
  {
    ecr: "public.ecr.aws/supabase/storage-api:v1.44.11",
    hub: "supabase/storage-api",
    manifest:
      "sha256:d07d65b061cada59c4cd35b87167b82712d42c51bfd5e11ba0b4070af4df6102",
    config:
      "sha256:c7d3e6e6010dfdf9b2ce6088274e8eb1b35ba19e0bc5fb30f74e303bd031b7fc",
  },
  {
    ecr: "public.ecr.aws/supabase/kong:2.8.1",
    hub: "library/kong",
    manifest:
      "sha256:e21b0b793879ab96720ed4188f9441260273f4bf775bcbff8d435e019ffb759a",
    config:
      "sha256:3cefb958bcd694597b65adc00053a762b1f9a6df3c6031af528d052d75a64e1a",
  },
  {
    ecr: "public.ecr.aws/supabase/postgrest:v14.7",
    hub: "postgrest/postgrest",
    manifest:
      "sha256:1791139f50b4939d738c5b0009329aa9e9d4be0a960b6b580c4944b16e157b95",
    config:
      "sha256:dfbce466e2fc4abe7d9bbd81284144b7acc50e220e033edbf85f2071f565ceee",
  },
  {
    ecr: "public.ecr.aws/supabase/studio:2026.03.23-sha-b7847b7",
    hub: "supabase/studio",
    manifest:
      "sha256:640b6fdfaca3a0a0f6591c2739528a348b2fdd2968aaa06f1a49a1e1d5f6d7f5",
    config:
      "sha256:e089e9d99ca3c835538288a13f844c1e8360fa721e5ec97c36edbc949163c610",
  },
  {
    ecr: "public.ecr.aws/supabase/logflare:1.34.14",
    hub: "supabase/logflare",
    manifest:
      "sha256:c7bb40b2243181cf7e80b8f20606b1255a21316013c6d73554b0929468f72959",
    config:
      "sha256:9170e6f6fc7837e0493c60c1076f039a97f4ffc347b908923a69d15988b019ff",
  },
  {
    ecr: "public.ecr.aws/supabase/vector:0.53.0-alpine",
    hub: "timberio/vector",
    manifest:
      "sha256:7a74872eb7791f65357b200813bcf613c8dedcac561b4f1a68f9d290f6e6a40c",
    config:
      "sha256:dbd1d86387c3fe901ff1bd17910a779744a5312597815296d08153ec06d2f346",
  },
  {
    ecr: "public.ecr.aws/supabase/imgproxy:v3.8.0",
    hub: "darthsim/imgproxy",
    manifest:
      "sha256:e1a8f4b99dd65b374b5705550505ace929b9dac98694614bbab3510f9e5107dd",
    config:
      "sha256:25d21ff36e2b7b66f8202e390b1919c5d03aab47fa98d33a47a3d33a7b89b4bd",
  },
  {
    ecr: "public.ecr.aws/supabase/mailpit:v1.22.3",
    hub: "axllent/mailpit",
    manifest:
      "sha256:168f762c218e167ba88ae7e48194126eb5ba5e99ef652063e3f14f9c4f0ee70f",
    config:
      "sha256:3f56e44ddc1a5655b8f288a2aa812db567b2f5f0b8bc18ef3da63b94a95608d5",
  },
  {
    ecr: "public.ecr.aws/supabase/postgres-meta:v0.96.1",
    hub: "supabase/postgres-meta",
    manifest:
      "sha256:6111fe3317ef6022178d12d23624983fe6b0d28ad853dec9067a344337409b9a",
    config:
      "sha256:7cfec5bfb61135924fb1829100b306502ac50459fd816d4f5f67eef478612699",
  },
  {
    ecr: "public.ecr.aws/supabase/edge-runtime:v1.73.0",
    hub: "supabase/edge-runtime",
    manifest:
      "sha256:0be7a1ed2f598a772786f27ed96e1e3cc523be351f7fd6ab1a2f30bd134dce31",
    config:
      "sha256:6d074bd7e0de4d28f43446020ece57a2de6c3c56bc8fdf7c5de132a035c6fcf5",
  },
] as const;
