export function SceneLighting() {
  return (
    <>
      {/* Strong ambient so cards are never dark */}
      <ambientLight intensity={1.2} />
      {/* Key light from above-front — illuminates card faces */}
      <directionalLight position={[0, 10, 5]} intensity={1.0} />
      {/* Fill light from below to brighten tilted hand cards */}
      <directionalLight position={[0, 2, 8]} intensity={0.5} />
    </>
  );
}
