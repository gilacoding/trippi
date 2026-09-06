(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MarkicabParser = factory();
  }
})(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  // ─────────────────────────────────────────────────────────────────
  // Markicab Parser Abstraction
  //
  // Defines the contract that ALL format-specific parsers must
  // implement. Every parser accepts raw input (JSON string, PDF
  // bytes, CSV text, etc.) and produces a canonical Trip object.
  //
  // This module is OPEN for extension (new formats) without
  // modification — register new parsers via ParserRegistry.
  // ─────────────────────────────────────────────────────────────────

  /**
   * Custom error type for parse failures.
   * Carries structured information about what went wrong and where.
   *
   * @param {string} message   Human-readable error description
   * @param {string|null} path Field path where error occurred (e.g., "trip.items[2].date")
   * @param {string|null} expected  Expected type or constraint
   * @param {*} actual    Actual value encountered
   */
  class ParserError extends Error {
    constructor(message, path, expected, actual) {
      super(message);
      this.name = 'ParserError';
      this.path = path || null;
      this.expected = expected || null;
      this.actual = actual !== undefined ? actual : null;
    }

    toJSON() {
      return {
        name: this.name,
        message: this.message,
        path: this.path,
        expected: this.expected,
        actual: this.actual
      };
    }
  }

  /**
   * Error thrown when no suitable parser is found for given input.
   */
  class UnsupportedFormatError extends ParserError {
    constructor(message, actual) {
      super(message || 'No suitable parser found for input', null, 'known format', actual);
      this.name = 'UnsupportedFormatError';
    }
  }

  /**
   * Abstract base parser. All format-specific parsers MUST extend this.
   *
   * Subclasses MUST override:
   *   - getFormat()  → return format identifier string
   *   - canParse()   → return true if this parser can handle the input
   *   - parse()      → return a canonical Trip object
   *
   * Subclasses MUST NOT override:
   *   - validate()   → semantic validation (shared logic)
   */
  class BaseParser {
    constructor() {
      if (new.target === BaseParser) {
        throw new TypeError('BaseParser is abstract and cannot be instantiated directly');
      }
    }

    /**
     * Returns the format identifier this parser handles.
     * Must be a lowercase string (e.g., "json", "csv", "pdf", "excel").
     * @returns {string}
     */
    getFormat() {
      throw new Error(this.constructor.name + '.getFormat() must be implemented');
    }

    /**
     * Quick check whether this parser can handle the given raw input.
     * Should be lightweight — no full parse, just format detection.
     * @param {string|Buffer|*} rawInput  The raw input in its native form
     * @returns {boolean}
     */
    canParse(rawInput) {
      throw new Error(this.constructor.name + '.canParse() must be implemented');
    }

    /**
     * Parses raw input into a canonical Trip object.
     * MUST throw ParserError on malformed input.
     * MUST normalize dates, times, monetary values, and links per canonical model.
     * @param {string|Buffer|*} rawInput  The raw input in its native form
     * @returns {Trip}  Canonical trip object conforming to the import model
     * @throws {ParserError} On any validation or parse failure
     */
    parse(rawInput) {
      throw new Error(this.constructor.name + '.parse() must be implemented');
    }

    /**
     * Semantic validation shared by all parsers.
     * Validates the canonical model rules from the spec.
     * @param {Trip} trip  The parsed trip object to validate
     * @throws {ParserError} On any rule violation
     */
    validate(trip) {
      if (!trip || typeof trip !== 'object') {
        throw new ParserError('Trip must be an object', 'trip', 'object', trip);
      }

      // Required fields
      if (!trip.id || typeof trip.id !== 'string') {
        throw new ParserError('Trip.id is required and must be a string', 'trip.id', 'string', trip.id);
      }
      if (!trip.name || typeof trip.name !== 'string') {
        throw new ParserError('Trip.name is required and must be a string', 'trip.name', 'string', trip.name);
      }
      if (!trip.start || !/^\d{4}-\d{2}-\d{2}$/.test(trip.start)) {
        throw new ParserError('Trip.start is required and must be YYYY-MM-DD', 'trip.start', 'date (YYYY-MM-DD)', trip.start);
      }
      if (!trip.end || !/^\d{4}-\d{2}-\d{2}$/.test(trip.end)) {
        throw new ParserError('Trip.end is required and must be YYYY-MM-DD', 'trip.end', 'date (YYYY-MM-DD)', trip.end);
      }

      // Date range
      if (trip.end < trip.start) {
        throw new ParserError(
          'Trip.end must be >= Trip.start',
          'trip.end',
          '>= ' + trip.start,
          trip.end
        );
      }

      // Item dates within trip range
      if (Array.isArray(trip.items)) {
        trip.items.forEach(function(item, idx) {
          if (item.date && (item.date < trip.start || item.date > trip.end)) {
            throw new ParserError(
              'Item date must be within trip date range',
              'trip.items[' + idx + '].date',
              trip.start + ' to ' + trip.end,
              item.date
            );
          }
        });
      }

      // Expense dates within trip range
      if (Array.isArray(trip.expenses)) {
        trip.expenses.forEach(function(expense, idx) {
          if (expense.date && (expense.date < trip.start || expense.date > trip.end)) {
            throw new ParserError(
              'Expense date must be within trip date range',
              'trip.expenses[' + idx + '].date',
              trip.start + ' to ' + trip.end,
              expense.date
            );
          }
        });
      }

      // Waypoint sequence uniqueness
      if (Array.isArray(trip.routes)) {
        trip.routes.forEach(function(route, rIdx) {
          if (Array.isArray(route.waypoints)) {
            var sequences = {};
            route.waypoints.forEach(function(wp, wIdx) {
              if (sequences[wp.sequence] !== undefined) {
                throw new ParserError(
                  'Waypoint sequence must be unique within route',
                  'trip.routes[' + rIdx + '].waypoints[' + wIdx + '].sequence',
                  'unique integer',
                  wp.sequence
                );
              }
              sequences[wp.sequence] = true;
            });
          }
        });
      }

      // Member uniqueness
      if (Array.isArray(trip.members)) {
        var userIds = {};
        trip.members.forEach(function(member, idx) {
          if (userIds[member.userId] !== undefined) {
            throw new ParserError(
              'Member userId must be unique within trip',
              'trip.members[' + idx + '].userId',
              'unique string',
              member.userId
            );
          }
          userIds[member.userId] = true;
        });
      }

      // Expense category validation
      var validCategories = ['Makan', 'Transport', 'Hotel', 'Tiket', 'Belanja', 'Lainnya'];
      if (Array.isArray(trip.expenses)) {
        trip.expenses.forEach(function(expense, idx) {
          if (expense.category && validCategories.indexOf(expense.category) === -1) {
            throw new ParserError(
              'Expense category must be one of: ' + validCategories.join(', '),
              'trip.expenses[' + idx + '].category',
              validCategories.join(' | '),
              expense.category
            );
          }
        });
      }
    }
  }

  /**
   * Plugin-style registry for parsers.
   * Register format-specific parsers and dispatch raw input to the
   * correct one.
   */
  class ParserRegistry {
    constructor() {
      /** @type {Map<string, BaseParser>} */
      this._parsers = new Map();
    }

    /**
     * Register a parser instance.
     * @param {BaseParser} parser  A concrete parser implementation
     * @throws {TypeError} If parser is not a BaseParser instance
     */
    register(parser) {
      if (!(parser instanceof BaseParser)) {
        throw new TypeError('Only BaseParser instances can be registered');
      }
      this._parsers.set(parser.getFormat(), parser);
    }

    /**
     * Unregister a parser by format.
     * @param {string} format  Format identifier (e.g., "json")
     * @returns {boolean} True if a parser was removed
     */
    unregister(format) {
      return this._parsers.delete(format);
    }

    /**
     * Get a parser for the given format.
     * @param {string} format  Format identifier
     * @returns {BaseParser|null}
     */
    getParser(format) {
      return this._parsers.get(format) || null;
    }

    /**
     * Detect the format and parse the raw input.
     * Iterates registered parsers in registration order; the first
     * parser whose canParse() returns true handles the input.
     * @param {string|Buffer|*} rawInput  The raw input
     * @returns {Trip}  Canonical trip object
     * @throws {UnsupportedFormatError} If no parser can handle the input
     * @throws {ParserError} If parsing/validation fails
     */
    detectAndParse(rawInput) {
      var entries = this._parsers.entries();
      var next;
      while (!(next = entries.next()).done) {
        var format = next.value[0];
        var parser = next.value[1];
        if (parser.canParse(rawInput)) {
          return parser.parse(rawInput);
        }
      }
      throw new UnsupportedFormatError(
        'No suitable parser found for input',
        typeof rawInput === 'string' ? rawInput.substring(0, 100) : typeof rawInput
      );
    }

    /**
     * List all registered format identifiers.
     * @returns {string[]}
     */
    getAvailableFormats() {
      return Array.from(this._parsers.keys());
    }

    /**
     * Check if a format is registered.
     * @param {string} format
     * @returns {boolean}
     */
    hasFormat(format) {
      return this._parsers.has(format);
    }
  }

  return {
    ParserError: ParserError,
    UnsupportedFormatError: UnsupportedFormatError,
    BaseParser: BaseParser,
    ParserRegistry: ParserRegistry
  };
});
