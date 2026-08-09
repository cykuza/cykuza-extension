import {
  SELF_HOST_ELECTRUM_CTA,
  SELF_HOST_ELECTRUM_GUIDE,
} from '../../domain/electrum/selfHost';
import { openExtensionPage } from '../../platform/openExtensionPage';
import Banner from './Banner';
import type { TrustBanner } from '../lib/trustBanner';

interface Props {
  banner: TrustBanner;
}

/** Renders electrum trust / builtin-risk copy with optional self-host CTA. */
export default function ElectrumTrustNotice({ banner }: Props) {
  return (
    <Banner tone={banner.tone === 'danger' ? 'danger' : 'warn'}>
      <p>{banner.message}</p>
      {banner.offerSelfHostGuide && (
        <p>
          <button
            type="button"
            className="text-link"
            onClick={() => openExtensionPage(SELF_HOST_ELECTRUM_GUIDE)}
          >
            {SELF_HOST_ELECTRUM_CTA}
          </button>
        </p>
      )}
    </Banner>
  );
}
