import Button from '../components/Button';

interface Props {
  onSelectMnemonic: () => void;
  onSelectPrivateKey: () => void;
}

export default function ImportMethodView({
  onSelectMnemonic,
  onSelectPrivateKey,
}: Props) {
  return (
    <div className="panel">
      <p className="muted">Choose how to restore this wallet.</p>
      <Button block onClick={onSelectMnemonic}>
        Import Mnemonic
      </Button>
      <Button block variant="secondary" onClick={onSelectPrivateKey}>
        Import Private Key
      </Button>
    </div>
  );
}
