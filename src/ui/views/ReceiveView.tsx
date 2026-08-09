import type { WalletStatus } from '../../messaging/protocol';
import Banner from '../components/Banner';
import CopyButton from '../components/CopyButton';
import QrCode from '../components/QrCode';
import { networkLabel } from '../lib/format';

interface Props {
  status: WalletStatus;
}

export default function ReceiveView({ status }: Props) {
  const address = status.address ?? '';

  return (
    <div className="panel">
      {status.network === 'testnet' && (
        <Banner tone="danger">
          Testnet coins have no real value. Do not send mainnet funds here.
        </Banner>
      )}

      {address ? (
        <div className="card center">
          <QrCode value={address} />
          <p className="mono break-all">{address}</p>
          <CopyButton
            value={address}
            label="Copy address"
            ariaLabel="Copy receive address"
          />
          <p className="muted">
            Scan this QR or copy the address to receive Cyberyen{' '}
            {networkLabel(status.network)}.
          </p>
        </div>
      ) : (
        <p className="error">No address available. Unlock the wallet first.</p>
      )}
    </div>
  );
}
