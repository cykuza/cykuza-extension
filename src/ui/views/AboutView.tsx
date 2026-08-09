import {
  BUILTIN_ELECTRUM_RISK_MESSAGE,
  SELF_HOST_ELECTRUM_CTA,
  SELF_HOST_ELECTRUM_GUIDE,
} from '../../domain/electrum/selfHost';
import { openExtensionPage } from '../../platform/openExtensionPage';
import Banner from '../components/Banner';

/**
 * Settings → About: OSS posture, built-in Electrum risks, self-host CTA.
 */
export default function AboutView() {
  return (
    <div className="panel">
      <p>
        Cykuza is a non-custodial Cyberyen browser wallet. Keys stay on this
        device in an encrypted vault; while unlocked they live only in extension
        process memory.
      </p>

      <Banner tone="warn">
        <p>{BUILTIN_ELECTRUM_RISK_MESSAGE}</p>
        <p>
          Prefer a server you operate.{' '}
          <button
            type="button"
            className="text-link"
            onClick={() => openExtensionPage(SELF_HOST_ELECTRUM_GUIDE)}
          >
            {SELF_HOST_ELECTRUM_CTA}
          </button>
        </p>
      </Banner>

      <p className="muted">
        Source builds without injected defaults require a custom{' '}
        <code>wss://</code> endpoint in Network settings before Refresh or Send.
      </p>
    </div>
  );
}
