import QRCode from 'qrcode';

/**
 * QR code, rendered server side as inline SVG.
 *
 * Roadmap Phase 1 adds destination QR check-ins. Generating the code on the
 * server and inlining the SVG keeps the prototype offline: no image service, no
 * client library, and it prints cleanly for a sign at a site entrance.
 */
export async function QrCode({
  value,
  size = 160,
  label,
}: {
  value: string;
  size?: number;
  label: string;
}) {
  const svg = await QRCode.toString(value, {
    type: 'svg',
    margin: 1,
    // High correction, because these are printed and go up outdoors.
    errorCorrectionLevel: 'H',
    color: { dark: '#14161f', light: '#ffffff' },
  });

  return (
    <div
      className="inline-block rounded-md border border-line bg-white p-2"
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
