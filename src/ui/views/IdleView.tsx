import Button from '../components/Button';

interface Props {
  onCreate: () => void;
  onImport: () => void;
}

/** Post-terms home: create or import — only reachable after Terms agree. */
export default function IdleView({ onCreate, onImport }: Props) {
  return (
    <section className="idle" aria-labelledby="idle-title">
      <header className="idle-header">
        <h2 id="idle-title" className="idle-title">
          Get started
        </h2>
        <p className="idle-lead">
          Create a new Cyberyen wallet or import one you already control.
        </p>
      </header>

      <div className="idle-actions">
        <Button block onClick={onCreate}>
          Create New Wallet
        </Button>
        <Button block variant="secondary" onClick={onImport}>
          Import Wallet
        </Button>
      </div>

      <p className="idle-footnote">
        Keys never leave your device. Encrypted vault only — no cloud, no
        telemetry.
      </p>
    </section>
  );
}
