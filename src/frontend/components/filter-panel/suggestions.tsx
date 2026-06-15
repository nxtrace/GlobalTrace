import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { compactText, normalizeAsn } from "../../../shared/filters";
import { Input, Textarea } from "../ui/input";

const MAX_VISIBLE_SUGGESTIONS = 8;
const MAGIC_PLACEHOLDER =
  "Shanghai+China Telecom, US+AS7922, Yokohama+JP+AS17676+SoftBank";

interface IndexedMagicToken {
  lower: string;
  normalizedAsn: string;
}

interface IndexedMagicOption {
  value: string;
  tokens: IndexedMagicToken[];
  includesWorld: boolean;
}

export function MagicSuggestionTextarea({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const listboxId = useId();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [cursorPosition, setCursorPosition] = useState(value.length);
  const indexedOptions = useMemo(() => indexMagicOptions(options), [options]);
  const query = useMemo(
    () => magicSegmentAt(value, cursorPosition).query,
    [cursorPosition, value],
  );
  const visibleOptions = useMemo(() => {
    const queryTokens = magicOptionTokens(query);
    if (!queryTokens.length) return [];
    const matches: string[] = [];
    for (const option of indexedOptions) {
      if (magicIndexedOptionMatchesQuery(option, queryTokens)) {
        matches.push(option.value);
        if (matches.length >= MAX_VISIBLE_SUGGESTIONS) break;
      }
    }
    return matches;
  }, [indexedOptions, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [options, value, cursorPosition]);

  const showOptions = open && visibleOptions.length > 0;
  const activeOptionId = showOptions
    ? `${listboxId}-${activeIndex}`
    : undefined;

  const updateCursorPosition = (textarea: HTMLTextAreaElement) => {
    setCursorPosition(textarea.selectionStart ?? textarea.value.length);
  };

  const selectOption = (option: string) => {
    const position = textareaRef.current?.selectionStart ?? cursorPosition;
    const segment = magicSegmentAt(value, position);
    const nextValue = replaceMagicSegment(
      value,
      segment.start,
      segment.end,
      option,
    );
    const leadingWhitespace =
      value.slice(segment.start, segment.end).match(/^\s*/)?.[0] ?? "";
    onChange(nextValue);
    setOpen(false);
    setCursorPosition(segment.start + leadingWhitespace.length + option.length);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }

    if (!visibleOptions.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) =>
        Math.min(current + 1, visibleOptions.length - 1),
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === "Enter" && showOptions) {
      event.preventDefault();
      selectOption(visibleOptions[activeIndex]);
    }
  };

  const handleOptionMouseDown = (
    event: MouseEvent<HTMLDivElement>,
    option: string,
  ) => {
    event.preventDefault();
    selectOption(option);
  };

  return (
    <div className="suggestion-input">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          updateCursorPosition(event.target);
          setOpen(true);
        }}
        onFocus={(event) => {
          updateCursorPosition(event.target);
          setOpen(true);
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 0)}
        onClick={(event) => updateCursorPosition(event.currentTarget)}
        onKeyUp={(event) => updateCursorPosition(event.currentTarget)}
        onSelect={(event) => updateCursorPosition(event.currentTarget)}
        onKeyDown={handleKeyDown}
        className="border-0 bg-transparent shadow-none backdrop-blur-none hover:bg-transparent focus-visible:ring-0"
        rows={3}
        placeholder={MAGIC_PLACEHOLDER}
        role="combobox"
        aria-label="magic string"
        aria-autocomplete="list"
        aria-expanded={showOptions}
        aria-controls={listboxId}
        aria-activedescendant={activeOptionId}
      />
      {showOptions && (
        <div
          id={listboxId}
          className="suggestion-popover"
          role="listbox"
          aria-label="候选列表"
        >
          {visibleOptions.map((option, index) => (
            <div
              id={`${listboxId}-${index}`}
              className="suggestion-option"
              key={option}
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(event) => handleOptionMouseDown(event, option)}
            >
              {option}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function SuggestionInput({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const visibleOptions = useMemo(() => {
    const query = value.trim().toLowerCase();
    const matches = query
      ? options.filter((option) => option.toLowerCase().includes(query))
      : options;
    return matches.slice(0, MAX_VISIBLE_SUGGESTIONS);
  }, [options, value]);

  useEffect(() => {
    setActiveIndex(0);
  }, [options, value]);

  const showOptions = open && visibleOptions.length > 0;
  const activeOptionId = showOptions
    ? `${listboxId}-${activeIndex}`
    : undefined;

  const selectOption = (option: string) => {
    onChange(option);
    setOpen(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }

    if (!visibleOptions.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) =>
        Math.min(current + 1, visibleOptions.length - 1),
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === "Enter" && showOptions) {
      event.preventDefault();
      selectOption(visibleOptions[activeIndex]);
    }
  };

  const handleOptionMouseDown = (
    event: MouseEvent<HTMLDivElement>,
    option: string,
  ) => {
    event.preventDefault();
    selectOption(option);
  };

  return (
    <div className="suggestion-input">
      <Input
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={showOptions}
        aria-controls={listboxId}
        aria-activedescendant={activeOptionId}
      />
      {showOptions && (
        <div
          id={listboxId}
          className="suggestion-popover"
          role="listbox"
          aria-label="候选列表"
        >
          {visibleOptions.map((option, index) => (
            <div
              id={`${listboxId}-${index}`}
              className="suggestion-option"
              key={option}
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(event) => handleOptionMouseDown(event, option)}
            >
              {option}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function indexMagicOptions(options: string[]): IndexedMagicOption[] {
  return options.map((value) => {
    const tokens = magicOptionTokens(value);
    return {
      value,
      tokens,
      includesWorld: tokens.some((token) => token.lower === "world"),
    };
  });
}

function magicOptionTokens(value: string): IndexedMagicToken[] {
  return value
    .split("+")
    .map(compactText)
    .filter(Boolean)
    .map((token) => ({
      lower: token.toLowerCase(),
      normalizedAsn: normalizeAsn(token),
    }));
}

function magicIndexedOptionMatchesQuery(
  option: IndexedMagicOption,
  queryTokens: IndexedMagicToken[],
): boolean {
  if (!option.tokens.length || option.includesWorld) return true;
  return queryTokens.every((queryToken) =>
    option.tokens.some((optionToken) =>
      magicIndexedTokenMatches(optionToken, queryToken),
    ),
  );
}

function magicIndexedTokenMatches(
  optionToken: IndexedMagicToken,
  queryToken: IndexedMagicToken,
): boolean {
  if (!queryToken.lower || queryToken.lower === "world") return true;
  if (/^(AS)?\d+$/i.test(queryToken.lower)) {
    return (
      optionToken.normalizedAsn === queryToken.normalizedAsn ||
      optionToken.lower.includes(queryToken.lower)
    );
  }
  return optionToken.lower.includes(queryToken.lower);
}

function magicSegmentAt(
  value: string,
  position: number,
): { start: number; end: number; query: string } {
  const cursor = Math.max(0, Math.min(position, value.length));
  const start = value.lastIndexOf(",", Math.max(0, cursor - 1)) + 1;
  const nextComma = value.indexOf(",", cursor);
  const end = nextComma === -1 ? value.length : nextComma;
  return { start, end, query: value.slice(start, end).trim() };
}

function replaceMagicSegment(
  value: string,
  start: number,
  end: number,
  option: string,
): string {
  const segment = value.slice(start, end);
  const leadingWhitespace = segment.match(/^\s*/)?.[0] ?? "";
  const trailingWhitespace = segment.trim()
    ? (segment.match(/\s*$/)?.[0] ?? "")
    : "";
  return `${value.slice(0, start)}${leadingWhitespace}${option}${trailingWhitespace}${value.slice(end)}`;
}
