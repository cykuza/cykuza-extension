import { QRCodeSVG } from 'qrcode.react';

interface Props {
  value: string;
  size?: number;
}

export default function QrCode({ value, size = 180 }: Props) {
  return <QRCodeSVG value={value} size={size} bgColor="#000000" fgColor="#ffffff" />;
}
