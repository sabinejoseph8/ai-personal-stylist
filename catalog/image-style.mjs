// One consistent photo style for every sample product image (risk 13): a single item, no people,
// no logos or brand marks, on a plain light background. Shared by the test and the full run.
export const IMAGE_MODEL = "gpt-image-2";
// Sabine picked setting A (medium quality) on 20 Oct 2026: same look on a phone, about a quarter of the cost.
export const IMAGE_QUALITY = "medium";

export function imagePrompt(p) {
  return [
    `Studio product photo of a single ${p.imageDescription}.`,
    "Clean e-commerce catalog style: the item alone, centered, fully in frame, shown front-on or at a gentle three-quarter angle.",
    "Plain warm light-grey seamless background (#ECEEEC), soft even studio lighting, a faint natural shadow beneath.",
    "No person, no mannequin, no hanger, no props, no text, no logos, no brand marks, no labels.",
    "Photorealistic, true-to-life color and fabric texture, sharp focus.",
  ].join(" ");
}
