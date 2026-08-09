import { useState } from 'react';
import { looksLikeNetworkAddress } from '../../domain/addressFormat';
import {
  MAX_ADDRESS_BOOK_ENTRIES,
  MAX_ADDRESS_BOOK_LABEL_LENGTH,
} from '../../domain/limits';
import { walletRpc } from '../../messaging/client';
import type { WalletStatus } from '../../messaging/protocol';
import Button from '../components/Button';
import Check from '../components/Check';
import CopyButton from '../components/CopyButton';
import Field from '../components/Field';
import { networkLabel } from '../lib/format';
import { maskAddress } from '../lib/mask';

interface Props {
  status: WalletStatus;
  onChanged: (status: WalletStatus) => void;
}

export default function AddressBookView({ status, onChanged }: Props) {
  const network = status.network;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [showFullAddresses, setShowFullAddresses] = useState(false);
  const [bookLabel, setBookLabel] = useState('');
  const [bookAddress, setBookAddress] = useState('');

  const allEntries = status.addressBook ?? [];
  const networkBook = allEntries.filter((e) => e.network === network);
  const atMax = allEntries.length >= MAX_ADDRESS_BOOK_ENTRIES;

  const displayAddress = (address: string) =>
    showFullAddresses ? address : maskAddress(address);

  const addAddressBookEntry = async () => {
    setError(null);
    setInfo(null);
    const label = bookLabel.trim().slice(0, MAX_ADDRESS_BOOK_LABEL_LENGTH);
    const address = bookAddress.trim();
    if (!label) {
      setError('Enter a label for the address book entry.');
      return;
    }
    if (!looksLikeNetworkAddress(address, network)) {
      setError('Invalid address for the selected network.');
      return;
    }
    const withoutDup = allEntries.filter(
      (e) =>
        !(
          e.network === network &&
          e.address.toLowerCase() === address.toLowerCase()
        )
    );
    if (
      withoutDup.length >= MAX_ADDRESS_BOOK_ENTRIES &&
      withoutDup.length === allEntries.length
    ) {
      setError(`Address book is limited to ${MAX_ADDRESS_BOOK_ENTRIES} entries.`);
      return;
    }
    setBusy(true);
    try {
      const entries = [...withoutDup, { label, address, network }];
      const res = await walletRpc({ type: 'setAddressBook', entries });
      if (!res.ok) {
        setError(res.error);
        if (res.status) onChanged(res.status);
        return;
      }
      onChanged(res.status);
      setBookLabel('');
      setBookAddress('');
      setInfo('Address book updated.');
    } finally {
      setBusy(false);
    }
  };

  const removeAddressBookEntry = async (address: string) => {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const entries = allEntries.filter(
        (e) =>
          !(
            e.network === network &&
            e.address.toLowerCase() === address.toLowerCase()
          )
      );
      const res = await walletRpc({ type: 'setAddressBook', entries });
      if (!res.ok) {
        setError(res.error);
        if (res.status) onChanged(res.status);
        return;
      }
      onChanged(res.status);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <p className="muted">
        Saved recipients for {networkLabel(network)}. Not a send gate — you
        still confirm the last 6 characters. Max {MAX_ADDRESS_BOOK_ENTRIES}{' '}
        entries.
      </p>

      <Check
        checked={showFullAddresses}
        disabled={busy}
        onChange={setShowFullAddresses}
      >
        Show full addresses
      </Check>

      {networkBook.length === 0 ? (
        <p className="muted">No entries for {networkLabel(network)}.</p>
      ) : (
        <ul className="list">
          {networkBook.map((entry) => (
            <li key={`${entry.network}:${entry.address}`} className="list-row">
              <div className="flex-1">
                <strong>{entry.label}</strong>
                <div className="mono muted">{displayAddress(entry.address)}</div>
              </div>
              <div className="row">
                {showFullAddresses && (
                  <CopyButton
                    value={entry.address}
                    label="Copy"
                    ariaLabel={`Copy ${entry.label}`}
                  />
                )}
                <Button
                  variant="secondary"
                  tiny
                  disabled={busy}
                  onClick={() => void removeAddressBookEntry(entry.address)}
                >
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {atMax && (
        <p className="muted">
          Address book is full ({MAX_ADDRESS_BOOK_ENTRIES}). Remove an entry to
          add another.
        </p>
      )}

      <Field
        label="Label"
        value={bookLabel}
        disabled={busy || atMax}
        onChange={setBookLabel}
        inputProps={{
          maxLength: MAX_ADDRESS_BOOK_LABEL_LENGTH,
          autoComplete: 'off',
        }}
      />
      <Field
        label="Address"
        value={bookAddress}
        mono
        disabled={busy || atMax}
        onChange={setBookAddress}
        inputProps={{
          spellCheck: false,
          autoComplete: 'off',
          placeholder: network === 'testnet' ? 'tcyb1…' : 'cy1…',
        }}
      />
      <Button
        block
        busy={busy}
        disabled={atMax}
        onClick={() => void addAddressBookEntry()}
      >
        Add
      </Button>

      {error && <p className="error">{error}</p>}
      {info && (
        <p className="muted" aria-live="polite">
          {info}
        </p>
      )}
    </div>
  );
}
