import { useState, useRef, useEffect } from 'react';

function formatWithCommas(val) {
  if (val === null || val === undefined || val === '') return '';
  const str = String(val);
  const parts = str.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

function stripCommas(val) {
  return String(val || '').replace(/,/g, '');
}

export default function CurrencyInput({ value, onChange, onWheel, disabled, placeholder, className }) {
  const [display, setDisplay] = useState('');
  const inputRef = useRef(null);

  // Sync display when value changes externally
  useEffect(() => {
    const num = value !== null && value !== undefined && value !== '' ? Number(value) : null;
    if (num !== null && !isNaN(num)) {
      setDisplay(formatWithCommas(num));
    } else {
      setDisplay('');
    }
  }, [value]);

  const handleChange = (e) => {
    const raw = e.target.value;
    // Allow digits, commas, decimal point, and minus
    const cleaned = raw.replace(/[^0-9.,-]/g, '');
    setDisplay(formatWithCommas(stripCommas(cleaned)));

    // Pass the raw number to parent onChange
    const numericStr = stripCommas(cleaned);
    const syntheticEvent = { ...e, target: { ...e.target, value: numericStr } };
    onChange(syntheticEvent);
  };

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      value={display}
      onChange={handleChange}
      onWheel={onWheel || ((e) => e.target.blur())}
      disabled={disabled}
      placeholder={placeholder || '0'}
      className={className}
    />
  );
}
