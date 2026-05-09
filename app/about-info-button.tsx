import { LinkButton } from "./button";

// Inline "About" CTA that follows the homepage hero subhead. Was a tiny
// 28px info-icon button — too small to read as a tappable target on
// mobile and easy to miss as an action affordance entirely. Promoted to
// a text-with-arrow chip that mirrors the Subscribe / Create-event chips
// in the radius bar so the visual vocabulary stays consistent.
export default function AboutInfoButton() {
  return (
    <LinkButton
      href="/about"
      title="About PlayIRL.GG"
      aria-label="About PlayIRL.GG"
      variant="chip"
      className="ml-2 align-middle"
    >
      About
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="w-3 h-3"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </LinkButton>
  );
}
