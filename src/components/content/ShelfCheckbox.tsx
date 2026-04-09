import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import {
  readShelfState,
  subscribeShelfState,
  writeShelfState,
} from '../../utils/readingShelf';
import ShelfToggleButton from './ShelfToggleButton';

export interface ShelfCheckboxProps {
  checklistKey: string;
  label?: string;
}

export default function ShelfCheckbox({ checklistKey, label = 'Add to My Shelf' }: ShelfCheckboxProps) {
  const [shelved, setShelved] = useState(false);

  useEffect(() => {
    setShelved(Boolean(readShelfState()[checklistKey]));
    return subscribeShelfState(() => {
      setShelved(Boolean(readShelfState()[checklistKey]));
    });
  }, [checklistKey]);

  return (
    <ShelfToggleButton
      shelved={shelved}
      onToggle={(next) => writeShelfState(checklistKey, next)}
      ariaLabel={shelved ? 'Remove from My Shelf' : label}
      label={shelved ? 'On My Shelf' : label}
    />
  );
}
