import faviconUrl from "/public/favicon.svg";

interface MushroomLogoProps {
  size?: number;
}

export default function MushroomLogo({ size = 48 }: MushroomLogoProps) {
  return (
    <img src={faviconUrl} width={size} height={size} aria-hidden="true" className="mushroom-logo" />
  );
}
