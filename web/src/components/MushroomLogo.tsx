interface MushroomLogoProps {
  size?: number;
}

export default function MushroomLogo({ size = 48 }: MushroomLogoProps) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}favicon.svg`}
      width={size}
      height={size}
      aria-hidden="true"
      className="mushroom-logo"
    />
  );
}
