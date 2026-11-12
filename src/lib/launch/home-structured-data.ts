import { ESSENTIAL_FAQS, ESSENTIAL_FEATURES, IMPLEMENTED_HIGHLIGHTS } from "./essential-public-catalog";

/**
 * Feature names for structured data: the essential catalog plus the active
 * highlights by their descriptive name (not their marketing title), once each.
 */
export function homeFeatureList(): string[] {
  return [
    ...new Set([
      ...ESSENTIAL_FEATURES.flatMap((feature) => feature.features),
      ...IMPLEMENTED_HIGHLIGHTS.map((item) => item.featureName),
    ]),
  ];
}

/** JSON-LD of the home page. It says the same as the visible page. */
export function homeStructuredData(input: { description: string; url: string }) {
  return {
    softwareApplication: {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Zaltyko",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: input.description,
      url: input.url,
      inLanguage: "es",
      featureList: homeFeatureList(),
    },
    faqPage: {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: ESSENTIAL_FAQS.map(({ question, answer }) => ({
        "@type": "Question",
        name: question,
        acceptedAnswer: { "@type": "Answer", text: answer },
      })),
    },
  };
}
