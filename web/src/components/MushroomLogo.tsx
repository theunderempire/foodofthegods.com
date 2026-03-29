interface MushroomLogoProps {
  size?: number;
}

export default function MushroomLogo({ size = 48 }: MushroomLogoProps) {
  return (
    <img
      src="/favicon.svg"
      width={size}
      height={size}
      aria-hidden="true"
      className="mushroom-logo"
    />
  );
}
