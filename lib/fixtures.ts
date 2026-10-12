import type { PageContent } from "./types";
export const products = [
  {
    sku: "commuter-one",
    name: "Commuter One",
    spec: "Merchant-confirmed synthetic specification: Package contains one backpack only. The water bottle shown is a styling prop and is NOT included. The fabric is suitable for light rain only, not immersion or heavy rain. Laptop sleeve dimensions and device compatibility have not been confirmed.",
    content: {
      shortDescription:
        "Your everyday carry, ready for anything. 100% waterproof protection for your daily commute.",
      imageCaption: "Everything you need for the everyday journey.",
      faq: "What comes with my order? Your Commuter One is ready for your next adventure.",
    },
    feedback: [
      "I thought the bottle in the photo was included, but only the backpack arrived.",
      "The page says 100% waterproof. My bag got wet in heavy rain.",
      "Can this fit my 16-inch laptop?",
      "The zipper broke after one week.",
      "My delivery arrived three days late.",
    ],
  },
  {
    sku: "desk-light",
    name: "Fold Desk Light",
    spec: "Synthetic merchant specification: One lamp included. USB-C cable and power adapter are not included. Input power 5V. No battery. No waterproof certification.",
    content: {
      shortDescription: "A desk lamp for everyday work.",
      imageCaption: "Lamp pictured with cable.",
      faq: "Includes everything you need.",
    },
    feedback: [
      "I expected a cable in the box.",
      "Can I use it without plugging it in?",
    ],
  },
  {
    sku: "travel-mug",
    name: "Daybreak Mug",
    spec: "Synthetic merchant specification: One 350 ml stainless steel mug with lid. Hand wash only. Not microwave safe. No temperature-retention duration has been verified.",
    content: {
      shortDescription: "Keeps drinks hot all day.",
      imageCaption: "Your daily mug.",
      faq: "Easy care for every day.",
    },
    feedback: [
      "Can I put it in the dishwasher?",
      "My drink cooled down after two hours.",
    ],
  },
] satisfies {
  sku: string;
  name: string;
  spec: string;
  content: PageContent;
  feedback: string[];
}[];
