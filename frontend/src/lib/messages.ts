import type { Locale } from './i18n-config';

export type Messages = {
  app: {
    brand: string;
    title: string;
  };
  nav: {
    dashboard: string;
    customers: string;
    orders: string;
    sites: string;
    employees: string;
    workEntries: string;
    timesheets: string;
    invoiceDrafts: string;
    invoices: string;
    hoursReport: string;
    aiIntake: string;
  };
  common: {
    save: string;
    create: string;
    createNew: string;
    edit: string;
    delete: string;
    remove: string;
    open: string;
    back: string;
    reset: string;
    refresh: string;
    loading: string;
    notes: string;
    description: string;
    summary: string;
    status: string;
    customer: string;
    customers: string;
    order: string;
    orders: string;
    site: string;
    sites: string;
    employee: string;
    employees: string;
    contact: string;
    actions: string;
    city: string;
    street: string;
    zipCode: string;
    country: string;
    phone: string;
    email: string;
    date: string;
    hours: string;
    skills: string;
    certifications: string;
    start: string;
    end: string;
    name: string;
    title: string;
    noData: string;
    deleteConfirm: string;
    none: string;
    optional: string;
    source: string;
    yes: string;
    no: string;
    preview: string;
    year: string;
    group: string;
    details: string;
    total: string;
    lines: string;
    amount: string;
    rate: string;
    id: string;
    created: string;
    updateSuccess: string;
  };
  theme: {
    switchTitle: string;
    light: string;
    dark: string;
  };
  language: {
    switchTitle: string;
    de: string;
    en: string;
    ar: string;
  };
  statuses: {
    order: Record<'open' | 'paused' | 'closed', string>;
    invoice: Record<'draft' | 'final' | 'sent' | 'paid' | 'canceled', string>;
    workDay: Record<'work' | 'sick' | 'vacation' | 'holiday', string>;
    groupBy: Record<'employee' | 'site' | 'order', string>;
  };
  dashboard: {
    cards: Array<{ href: string; title: string; desc: string }>;
  };
  invoiceSequence: {
    heading: string;
    description: string;
    nextSeqLabel: string;
    saved: string;
    loadError: string;
    saveError: string;
    dbNext: string;
    configured: string;
  };
  dateInput: {
    placeholder: string;
    pick: string;
    invalid: string;
  };
  customersPage: {
    heading: string;
    companyNameRequired: string;
    companyName: string;
    vatId: string;
    contactName: string;
    noCustomers: string;
    company: string;
    place: string;
  };
  employeesPage: {
    heading: string;
    firstName: string;
    lastName: string;
    birthDate: string;
    hourlyRate: string;
    weeklyCapacity: string;
    availabilityHeading: string;
    addBlock: string;
    availabilityStart: string;
    availabilityEnd: string;
    availabilityReason: string;
    noAvailability: string;
    nameRequired: string;
    availabilityInvalid: string;
    noEmployees: string;
    capacity: string;
    blocks: string;
  };
  ordersPage: {
    heading: string;
    customerRequired: string;
    titleRequired: string;
    orderNumber: string;
    statusOpen: string;
    statusPaused: string;
    statusClosed: string;
    hourlyRate: string;
    noCustomersOption: string;
    noOrders: string;
    deleteHint: string;
  };
  orderDetailPage: {
    headingPrefix: string;
    editHeading: string;
    deleteOrder: string;
    siteNameRequired: string;
    addSite: string;
    assignmentHeading: string;
    assignmentSiteRequired: string;
    assignmentEmployeeRequired: string;
    noCustomersOption: string;
    noSitesOption: string;
    noEmployeesOption: string;
    noSites: string;
    deleteSitesHint: string;
    deleteAssignmentsHint: string;
    address: string;
    assignedEmployees: string;
    saveSite: string;
    newSite: string;
  };
  sitesPage: {
    heading: string;
    description: string;
    orderRequired: string;
    siteNameRequired: string;
    noOrdersOption: string;
    noSites: string;
    toOrder: string;
    deleteHint: string;
  };
  workEntriesPage: {
    heading: string;
    description: string;
    requiredSelection: string;
    requiredDate: string;
    positiveHours: string;
    noEmployeesOption: string;
    noOrdersOption: string;
    noSitesOption: string;
    filterHeading: string;
    draftInvoice: string;
    statusHours: string;
    noEntries: string;
    deleteHint: string;
    workStatus: string;
  };
  hoursReportPage: {
    heading: string;
    aggregateBy: string;
    totalHours: string;
    noRows: string;
    source: string;
  };
  invoicesPage: {
    heading: string;
    statusFilter: string;
    all: string;
    toDrafts: string;
    number: string;
    positions: string;
    noInvoices: string;
    deleteHint: string;
  };
  invoiceDraftsPage: {
    heading: string;
    groupBy: string;
    totalHours: string;
    allInvoices: string;
    draftCount: string;
    openAndMerge: string;
    noDrafts: string;
    mergeHint: string;
  };
  invoiceDraftGroupPage: {
    heading: string;
    missingKey: string;
    grouping: string;
    draftCount: string;
    totalHours: string;
    positionsDetail: string;
    noDrafts: string;
    noLines: string;
    mergeHeading: string;
    targetCount: string;
    targetCountHint: string;
    splitHours: string;
    splitPlaceholder: string;
    splitHint: string;
    merge: string;
    mergeSuccess: string;
    deleteHint: string;
    noDraftFound: string;
  };
  invoiceDetailPage: {
    heading: string;
    customer: string;
    draftHint: string;
    editHeading: string;
    invoiceNumber: string;
    issueDate: string;
    fixedAmount: string;
    fixedAmountPlaceholder: string;
    positions: string;
    noLines: string;
    totalHours: string;
    totalAmount: string;
    deleteHint: string;
    detailedPdf: string;
    fixedPdf: string;
    detailedWord: string;
    fixedWord: string;
  };
  timesheetPage: {
    heading: string;
    description: string;
    loadTable: string;
    selectEmployee: string;
    noEmployeesOption: string;
    selectPrompt: string;
    sheetTitle: string;
    worker: string;
    employer: string;
    workingTime: string;
    breakDeducted: string;
    totalHours: string;
    monthNames: string[];
  };
  aiIntakePage: {
    intake: string;
    flow: string;
    unnamed: string;
    noCustomer: string;
    noIntakes: string;
    conversation: string;
    conversationDesc: string;
    generateProposal: string;
    saveDraft: string;
    clearConversation: string;
    clearConversationConfirm: string;
    noConversation: string;
    messagePlaceholder: string;
    sendMessage: string;
    streaming: string;
    assistant: string;
    manager: string;
    proposal: string;
    proposalDesc: string;
    companyName: string;
    contactName: string;
    contactPhone: string;
    contactEmail: string;
    orderTitle: string;
    periodStart: string;
    periodEnd: string;
    totalHours: string;
    requiredSkills: string;
    requiredCertifications: string;
    orderDescription: string;
    addSite: string;
    siteLabel: string;
    noSites: string;
    recommendations: string;
    recommendationsDesc: string;
    calculateRecommendations: string;
    noRecommendations: string;
    timeframe: string;
    pricePreview: string;
    select: string;
    reason: string;
    capacity: string;
    noMatchingEmployees: string;
    excluded: string;
    confirmation: string;
    useExistingCustomer: string;
    createNewCustomer: string;
    estimatedPrice: string;
    currency: string;
    confirm: string;
    orderCreated: string;
    openOrder: string;
    createIntakeFirst: string;
    convertedAlert: string;
    createIntakeFailed: string;
    browserStreamingUnsupported: string;
    responseFailed: string;
    messageSendFailed: string;
    voiceStart: string;
    voiceStop: string;
    voiceCancel: string;
    voiceRecording: string;
    voiceTranscribing: string;
    voiceReviewHint: string;
    voiceUnsupported: string;
    voicePermissionDenied: string;
    voiceNoMicrophone: string;
    voiceNoSpeech: string;
    voiceTooLong: string;
    voiceTranscriptionFailed: string;
    recordingPreview: string;
    recordingDuration: string;
    recordingPeak: string;
    recordingSize: string;
    weeksUnit: string;
    score: string;
    history: string;
    entries: string;
    freeHours: string;
    bookedHours: string;
    assignmentPressure: string;
    defaultCapacity: string;
  };
};

export const messages: Record<Locale, Messages> = {
  de: {
    app: {
      brand: 'Z&M Rechnungen',
      title: 'Geschaeftsfuehrer-Portal',
    },
    nav: {
      dashboard: 'Dashboard',
      customers: 'Kunden',
      orders: 'Auftraege',
      sites: 'Baustellen',
      employees: 'Mitarbeiter',
      workEntries: 'Arbeitszeiten',
      timesheets: 'Stundentabelle',
      invoiceDrafts: 'Entwuerfe',
      invoices: 'Rechnungen',
      hoursReport: 'Stundenuebersicht',
      aiIntake: 'AI Intake',
    },
    common: {
      save: 'Speichern',
      create: 'Anlegen',
      createNew: 'Neu',
      edit: 'Bearbeiten',
      delete: 'Loeschen',
      remove: 'Entfernen',
      open: 'Oeffnen',
      back: 'Zurueck',
      reset: 'Zuruecksetzen',
      refresh: 'Aktualisieren',
      loading: 'Lade...',
      notes: 'Notizen',
      description: 'Beschreibung',
      summary: 'Zusammenfassung',
      status: 'Status',
      customer: 'Kunde',
      customers: 'Kunden',
      order: 'Auftrag',
      orders: 'Auftraege',
      site: 'Baustelle',
      sites: 'Baustellen',
      employee: 'Mitarbeiter',
      employees: 'Mitarbeiter',
      contact: 'Kontakt',
      actions: 'Aktionen',
      city: 'Stadt',
      street: 'Strasse',
      zipCode: 'PLZ',
      country: 'Land',
      phone: 'Telefon',
      email: 'E-Mail',
      date: 'Datum',
      hours: 'Stunden',
      skills: 'Skills',
      certifications: 'Zertifikate',
      start: 'Start',
      end: 'Ende',
      name: 'Name',
      title: 'Titel',
      noData: 'Keine Daten vorhanden.',
      deleteConfirm: 'Wirklich loeschen? Wenn dieser Eintrag noch verknuepft ist, ist das Loeschen nicht moeglich.',
      none: '-',
      optional: 'optional',
      source: 'Quelle',
      yes: 'Ja',
      no: 'Nein',
      preview: 'Vorschau',
      year: 'Jahr',
      group: 'Gruppe',
      details: 'Details',
      total: 'Gesamt',
      lines: 'Positionen',
      amount: 'Betrag',
      rate: 'Satz',
      id: 'ID',
      created: 'Erstellt',
      updateSuccess: 'Gespeichert.',
    },
    theme: {
      switchTitle: 'Theme wechseln',
      light: 'Hell',
      dark: 'Dunkel',
    },
    language: {
      switchTitle: 'Sprache wechseln',
      de: 'DE',
      en: 'EN',
      ar: 'AR',
    },
    statuses: {
      order: {
        open: 'offen',
        paused: 'pausiert',
        closed: 'geschlossen',
      },
      invoice: {
        draft: 'Entwurf',
        final: 'Final',
        sent: 'Gesendet',
        paid: 'Bezahlt',
        canceled: 'Storniert',
      },
      workDay: {
        work: 'Arbeit',
        sick: 'Krank',
        vacation: 'Urlaub',
        holiday: 'Feiertag',
      },
      groupBy: {
        employee: 'Mitarbeiter',
        site: 'Baustelle',
        order: 'Auftrag',
      },
    },
    dashboard: {
      cards: [
        { href: '/customers', title: 'Kunden', desc: 'Auftraggeber verwalten' },
        { href: '/orders', title: 'Auftraege', desc: 'Auftraege erstellen und anzeigen' },
        { href: '/sites', title: 'Baustellen', desc: 'Baustellen verwalten' },
        { href: '/employees', title: 'Mitarbeiter', desc: 'Mitarbeiter verwalten' },
        { href: '/work-entries', title: 'Arbeitszeiten', desc: 'Stunden erfassen (erzeugt Entwurf-Rechnung)' },
        { href: '/invoices/drafts', title: 'Entwurf-Rechnungen', desc: 'Gruppieren und zusammenfuehren' },
        { href: '/invoices', title: 'Rechnungen', desc: 'Alle Rechnungen + PDF' },
        { href: '/reports/hours', title: 'Stundenuebersicht', desc: 'Aggregation nach Mitarbeiter/Baustelle/Auftrag' },
        { href: '/ai-intake', title: 'AI Intake', desc: 'Chatbasierten Vorschlag erzeugen und Team empfehlen lassen' },
      ],
    },
    invoiceSequence: {
      heading: 'Naechste Rechnungsnummer',
      description:
        'Setze hier bei Bedarf die naechste Seriennummer fuer dieses Jahr (z.B. wenn bisher manuell nummeriert wurde). Kleinere/ungueltige Werte werden ignoriert.',
      nextSeqLabel: 'Naechste Seriennummer (XXXX)',
      saved: 'Gespeichert.',
      loadError: 'Fehler beim Laden.',
      saveError: 'Fehler beim Speichern.',
      dbNext: 'DB-Naechste',
      configured: 'Gesetzt',
    },
    dateInput: {
      placeholder: 'TT.MM.JJJJ',
      pick: 'auswaehlen',
      invalid: 'Ungueltiges Datum (Format: TT.MM.JJJJ)',
    },
    customersPage: {
      heading: 'Kunden',
      companyNameRequired: 'Firmenname ist erforderlich.',
      companyName: 'Firmenname',
      vatId: 'USt-IdNr',
      contactName: 'Ansprechpartner',
      noCustomers: 'Keine Kunden vorhanden.',
      company: 'Firma',
      place: 'Ort',
    },
    employeesPage: {
      heading: 'Mitarbeiter',
      firstName: 'Vorname',
      lastName: 'Nachname',
      birthDate: 'Geburtsdatum',
      hourlyRate: 'Standard-Stundensatz (EUR)',
      weeklyCapacity: 'Wochenkapazitaet (h)',
      availabilityHeading: 'Abwesenheitsbloecke',
      addBlock: 'Block hinzufuegen',
      availabilityStart: 'Start',
      availabilityEnd: 'Ende',
      availabilityReason: 'Grund',
      noAvailability: 'Keine Abwesenheitsbloecke.',
      nameRequired: 'Vorname und Nachname sind erforderlich.',
      availabilityInvalid: 'Jeder Abwesenheitsblock braucht Start- und Enddatum.',
      noEmployees: 'Keine Mitarbeiter vorhanden.',
      capacity: 'Kapazitaet',
      blocks: 'Bloecke',
    },
    ordersPage: {
      heading: 'Auftraege',
      customerRequired: 'Bitte Kunde auswaehlen.',
      titleRequired: 'Titel ist erforderlich.',
      orderNumber: 'Auftragsnummer',
      statusOpen: 'offen',
      statusPaused: 'pausiert',
      statusClosed: 'geschlossen',
      hourlyRate: 'Standard-Stundensatz (EUR)',
      noCustomersOption: '(Bitte zuerst Kunden anlegen)',
      noOrders: 'Keine Auftraege vorhanden.',
      deleteHint: 'Hinweis: Loeschen ist nur moeglich, wenn keine Baustellen/Arbeitszeiten existieren (FK-Regeln).',
    },
    orderDetailPage: {
      headingPrefix: 'Auftrag',
      editHeading: 'Auftrag bearbeiten',
      deleteOrder: 'Auftrag loeschen',
      siteNameRequired: 'Baustellenname ist erforderlich.',
      addSite: 'Baustelle anlegen',
      assignmentHeading: 'Mitarbeiter zuweisen',
      assignmentSiteRequired: 'Bitte Baustelle auswaehlen.',
      assignmentEmployeeRequired: 'Bitte Mitarbeiter auswaehlen.',
      noCustomersOption: '(Bitte zuerst Kunden anlegen)',
      noSitesOption: '(Bitte zuerst Baustelle anlegen)',
      noEmployeesOption: '(Bitte zuerst Mitarbeiter anlegen)',
      noSites: 'Keine Baustellen vorhanden.',
      deleteSitesHint:
        'Hinweis: Loeschen ist nur moeglich, wenn keine Arbeitszeiten/Rechnungspositionen/Zuordnungen existieren (FK-Regeln).',
      deleteAssignmentsHint:
        'Hinweis: Eine Zuordnung kann nicht geloescht werden, wenn bereits Arbeitszeiten fuer diese Baustelle erfasst wurden (FK-Regeln).',
      address: 'Adresse',
      assignedEmployees: 'Mitarbeiter',
      saveSite: 'Speichern',
      newSite: 'Neu',
    },
    sitesPage: {
      heading: 'Baustellen',
      description: 'Stand-alone Uebersicht + CRUD. Zusaetzlich findest du Baustellen auch im jeweiligen Auftrag.',
      orderRequired: 'Bitte Auftrag auswaehlen.',
      siteNameRequired: 'Baustellenname ist erforderlich.',
      noOrdersOption: '(Bitte zuerst Auftrag anlegen)',
      noSites: 'Keine Baustellen vorhanden.',
      toOrder: 'Zum Auftrag',
      deleteHint: 'Hinweis: Loeschen ist nur moeglich, wenn keine Arbeitszeiten/Zuordnungen existieren (FK-Regeln).',
    },
    workEntriesPage: {
      heading: 'Arbeitszeiten erfassen',
      description: 'Jeder Eintrag erzeugt automatisch eine Entwurf-Rechnung - ausser Krank/Urlaub/Feiertag.',
      requiredSelection: 'Bitte Mitarbeiter, Auftrag und Baustelle auswaehlen.',
      requiredDate: 'Bitte Datum waehlen.',
      positiveHours: 'Stunden muessen > 0 sein.',
      noEmployeesOption: '(Bitte zuerst Mitarbeiter anlegen)',
      noOrdersOption: '(Bitte zuerst Auftrag anlegen)',
      noSitesOption: '(Keine Baustelle fuer diesen Auftrag)',
      filterHeading: 'Filter',
      draftInvoice: 'Entwurf-Rechnung',
      statusHours: 'Stunden / Status',
      noEntries: 'Keine Arbeitszeiten vorhanden.',
      deleteHint:
        'Hinweis: Bearbeiten/Loeschen ist nur moeglich, solange die Arbeitszeit nicht in eine nicht-Entwurf-Rechnung uebernommen oder auf mehrere Rechnungen aufgeteilt wurde.',
      workStatus: 'Status',
    },
    hoursReportPage: {
      heading: 'Stundenuebersicht',
      aggregateBy: 'Aggregation nach',
      totalHours: 'Stunden gesamt',
      noRows: 'Keine Arbeitszeiten vorhanden.',
      source: 'Quelle: Arbeitszeiten (Work Entries).',
    },
    invoicesPage: {
      heading: 'Rechnungen',
      statusFilter: 'Status-Filter',
      all: '(alle)',
      toDrafts: 'Zu Entwuerfen',
      number: 'Nr',
      positions: 'Positionen',
      noInvoices: 'Keine Rechnungen vorhanden.',
      deleteHint: 'Hinweis: Loeschen ist nur fuer Entwurf-Rechnungen moeglich.',
    },
    invoiceDraftsPage: {
      heading: 'Entwurf-Rechnungen',
      groupBy: 'Gruppieren nach',
      totalHours: 'Stunden gesamt',
      allInvoices: 'Alle Rechnungen',
      draftCount: 'Entwuerfe',
      openAndMerge: 'Oeffnen & zusammenfuehren',
      noDrafts: 'Keine Entwurf-Rechnungen vorhanden.',
      mergeHint:
        'Hinweis: Zusammenfuehren ist nur moeglich, wenn alle Entwuerfe denselben Kunden haben und zur gleichen Gruppe gehoeren.',
    },
    invoiceDraftGroupPage: {
      heading: 'Entwurf-Gruppe',
      missingKey: 'Fehlender Parameter: key',
      grouping: 'Gruppierung',
      draftCount: 'Anzahl Entwuerfe',
      totalHours: 'Gesamtstunden',
      positionsDetail: 'Positionen (Details)',
      noDrafts: 'Keine Entwuerfe.',
      noLines: 'Keine Positionen.',
      mergeHeading: 'Zusammenfuehren',
      targetCount: 'Anzahl Ziel-Rechnungen',
      targetCountHint: 'Leer lassen = automatisch 1 Rechnung mit allen Stunden.',
      splitHours: 'Stunden pro Rechnung (nur wenn Anzahl > 1)',
      splitPlaceholder: 'z.B. 4, 6',
      splitHint: 'Hinweis: Die Summe der Splits muss',
      merge: 'Zusammenfuehren',
      mergeSuccess: 'Zusammengefuehrt. Neue Rechnung(en):',
      deleteHint:
        'Hinweis: Das Loeschen einzelner Entwuerfe ist moeglich ueber "Rechnungen" (nur Status Entwurf). In V2 sind FK-Regeln aktiv.',
      noDraftFound: 'Keine Entwuerfe gefunden.',
    },
    invoiceDetailPage: {
      heading: 'Rechnung',
      customer: 'Kunde',
      draftHint: 'Hinweis: Entwuerfe bekommen keine Rechnungsnummer. Export ist erst nach "Zusammenfuehren" (Final) moeglich.',
      editHeading: 'Rechnung bearbeiten',
      invoiceNumber: 'Rechnungsnummer',
      issueDate: 'Rechnungsdatum',
      fixedAmount: 'Pauschalbetrag (optional)',
      fixedAmountPlaceholder: 'z.B. 4400.00',
      positions: 'Positionen',
      noLines: 'Keine Positionen.',
      totalHours: 'Summe Stunden',
      totalAmount: 'Summe Betrag',
      deleteHint: 'Hinweis: Loeschen ist nur fuer Entwurf-Rechnungen moeglich.',
      detailedPdf: 'PDF (detailliert)',
      fixedPdf: 'PDF (Pauschal)',
      detailedWord: 'Word (detailliert)',
      fixedWord: 'Word (Pauschal)',
    },
    timesheetPage: {
      heading: 'Stundentabelle',
      description: 'Monatsuebersicht pro Mitarbeiter inkl. PDF- und Word-Export.',
      loadTable: 'Tabelle anzeigen',
      selectEmployee: 'Bitte Mitarbeiter auswaehlen.',
      noEmployeesOption: '(Bitte zuerst Mitarbeiter anlegen)',
      selectPrompt: 'Bitte Auswahl treffen und "Tabelle anzeigen" klicken.',
      sheetTitle: 'Stunden Zettel',
      worker: 'Arbeitsnehmer',
      employer: 'Arbeitsgeber',
      workingTime: 'Arbeitszeit',
      breakDeducted: '(Abzueglich Pause)',
      totalHours: 'Gesamtstunden',
      monthNames: ['Januar', 'Februar', 'Maerz', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
    },
    aiIntakePage: {
      intake: 'AI Intake',
      flow: 'Chat -> Vorschlag -> Team -> Auftragsanlage',
      unnamed: 'Unbenannter Intake',
      noCustomer: 'Kein Kunde',
      noIntakes: 'Noch keine Intakes vorhanden.',
      conversation: 'Konversation',
      conversationDesc: 'Erfasste Anforderungen mit Gemini-Unterstuetzung',
      generateProposal: 'Vorschlag erzeugen',
      saveDraft: 'Entwurf speichern',
      clearConversation: 'Nachrichten leeren',
      clearConversationConfirm: 'Konversation wirklich leeren? Die gespeicherten Nachrichten dieses Intakes werden entfernt.',
      noConversation: 'Noch keine Unterhaltung.',
      messagePlaceholder: 'Neue Nachricht an den Intake-Assistenten...',
      sendMessage: 'Nachricht senden',
      streaming: 'Streaming...',
      assistant: 'Assistent',
      manager: 'Manager',
      proposal: 'Vorschlag',
      proposalDesc: 'Manuell pruefen und korrigieren, bevor Daten angelegt werden.',
      companyName: 'Firmenname',
      contactName: 'Kontaktname',
      contactPhone: 'Kontakttelefon',
      contactEmail: 'Kontakt-E-Mail',
      orderTitle: 'Auftragstitel',
      periodStart: 'Zeitraum Start',
      periodEnd: 'Zeitraum Ende',
      totalHours: 'Gesamtstunden',
      requiredSkills: 'Benoetigte Skills',
      requiredCertifications: 'Benoetigte Zertifikate',
      orderDescription: 'Auftragsbeschreibung',
      addSite: 'Baustelle hinzufuegen',
      siteLabel: 'Baustelle',
      noSites: 'Noch keine Baustellen im Vorschlag.',
      recommendations: 'Personalvorschlaege',
      recommendationsDesc: 'Deterministische Auswahl nach Skills, Kapazitaet und Historie.',
      calculateRecommendations: 'Empfehlungen berechnen',
      noRecommendations: 'Noch keine Empfehlungen berechnet.',
      timeframe: 'Zeitraum',
      pricePreview: 'Preisvorschau',
      select: 'Auswahl',
      reason: 'Grund',
      capacity: 'Kapazitaet',
      noMatchingEmployees: 'Keine geeigneten Mitarbeiter gefunden.',
      excluded: 'Ausgeschlossen',
      confirmation: 'Bestaetigung',
      useExistingCustomer: 'Bestehenden Kunden verwenden (optional)',
      createNewCustomer: 'Neuen Kunden aus Vorschlag anlegen',
      estimatedPrice: 'Geschaetzter Preis',
      currency: 'Waehrung',
      confirm: 'Vorschlag in Auftrag umwandeln',
      orderCreated: 'Angelegt',
      openOrder: 'Auftrag oeffnen',
      createIntakeFirst: 'Bitte zuerst einen Intake anlegen.',
      convertedAlert: 'Vorschlag wurde in Kunden-/Auftragsdaten umgewandelt.',
      createIntakeFailed: 'Intake konnte nicht angelegt werden.',
      browserStreamingUnsupported: 'Streaming wird von diesem Browser nicht unterstuetzt.',
      responseFailed: 'Gemini-Antwort fehlgeschlagen.',
      messageSendFailed: 'Nachricht konnte nicht gesendet werden.',
      voiceStart: 'Aufnahme starten',
      voiceStop: 'Aufnahme stoppen',
      voiceCancel: 'Aufnahme verwerfen',
      voiceRecording: 'Aufnahme laeuft',
      voiceTranscribing: 'Audio wird transkribiert...',
      voiceReviewHint: 'Transkript eingefuegt. Bitte pruefen und dann senden.',
      voiceUnsupported: 'Sprachaufnahme wird von diesem Browser nicht unterstuetzt.',
      voicePermissionDenied: 'Mikrofonzugriff wurde verweigert.',
      voiceNoMicrophone: 'Kein Mikrofon gefunden oder verfuegbar.',
      voiceNoSpeech: 'In der Aufnahme wurde kein verwertbarer Text erkannt.',
      voiceTooLong: 'Die Aufnahme wurde nach 90 Sekunden automatisch beendet.',
      voiceTranscriptionFailed: 'Transkription fehlgeschlagen.',
      recordingPreview: 'Audio-Vorschau',
      recordingDuration: 'Dauer',
      recordingPeak: 'Peak',
      recordingSize: 'Dateigroesse',
      weeksUnit: 'Wochen',
      score: 'Score',
      history: 'Historie',
      entries: 'Eintraege',
      freeHours: 'Frei',
      bookedHours: 'Gebucht',
      assignmentPressure: 'Druck aus Zuweisungen',
      defaultCapacity: 'Default 40h',
    },
  },
  en: {
    app: {
      brand: 'Z&M Billing',
      title: 'Manager Portal',
    },
    nav: {
      dashboard: 'Dashboard',
      customers: 'Customers',
      orders: 'Orders',
      sites: 'Sites',
      employees: 'Employees',
      workEntries: 'Work Entries',
      timesheets: 'Timesheets',
      invoiceDrafts: 'Drafts',
      invoices: 'Invoices',
      hoursReport: 'Hours Report',
      aiIntake: 'AI Intake',
    },
    common: {
      save: 'Save',
      create: 'Create',
      createNew: 'New',
      edit: 'Edit',
      delete: 'Delete',
      remove: 'Remove',
      open: 'Open',
      back: 'Back',
      reset: 'Reset',
      refresh: 'Refresh',
      loading: 'Loading...',
      notes: 'Notes',
      description: 'Description',
      summary: 'Summary',
      status: 'Status',
      customer: 'Customer',
      customers: 'Customers',
      order: 'Order',
      orders: 'Orders',
      site: 'Site',
      sites: 'Sites',
      employee: 'Employee',
      employees: 'Employees',
      contact: 'Contact',
      actions: 'Actions',
      city: 'City',
      street: 'Street',
      zipCode: 'ZIP',
      country: 'Country',
      phone: 'Phone',
      email: 'Email',
      date: 'Date',
      hours: 'Hours',
      skills: 'Skills',
      certifications: 'Certifications',
      start: 'Start',
      end: 'End',
      name: 'Name',
      title: 'Title',
      noData: 'No data available.',
      deleteConfirm: 'Delete this entry? If it is still linked to other data, deletion will fail.',
      none: '-',
      optional: 'optional',
      source: 'Source',
      yes: 'Yes',
      no: 'No',
      preview: 'Preview',
      year: 'Year',
      group: 'Group',
      details: 'Details',
      total: 'Total',
      lines: 'Lines',
      amount: 'Amount',
      rate: 'Rate',
      id: 'ID',
      created: 'Created',
      updateSuccess: 'Saved.',
    },
    theme: {
      switchTitle: 'Switch theme',
      light: 'Light',
      dark: 'Dark',
    },
    language: {
      switchTitle: 'Switch language',
      de: 'DE',
      en: 'EN',
      ar: 'AR',
    },
    statuses: {
      order: {
        open: 'open',
        paused: 'paused',
        closed: 'closed',
      },
      invoice: {
        draft: 'Draft',
        final: 'Final',
        sent: 'Sent',
        paid: 'Paid',
        canceled: 'Canceled',
      },
      workDay: {
        work: 'Work',
        sick: 'Sick',
        vacation: 'Vacation',
        holiday: 'Holiday',
      },
      groupBy: {
        employee: 'Employee',
        site: 'Site',
        order: 'Order',
      },
    },
    dashboard: {
      cards: [
        { href: '/customers', title: 'Customers', desc: 'Manage clients' },
        { href: '/orders', title: 'Orders', desc: 'Create and review orders' },
        { href: '/sites', title: 'Sites', desc: 'Manage construction sites' },
        { href: '/employees', title: 'Employees', desc: 'Manage employees' },
        { href: '/work-entries', title: 'Work Entries', desc: 'Capture hours and create draft invoices' },
        { href: '/invoices/drafts', title: 'Draft Invoices', desc: 'Group and merge draft invoices' },
        { href: '/invoices', title: 'Invoices', desc: 'All invoices with exports' },
        { href: '/reports/hours', title: 'Hours Report', desc: 'Aggregate by employee, site, or order' },
        { href: '/ai-intake', title: 'AI Intake', desc: 'Create proposal drafts and staffing suggestions from chat' },
      ],
    },
    invoiceSequence: {
      heading: 'Next invoice number',
      description:
        'Set the next serial number for this year when needed (for example if numbering was managed manually). Lower or invalid values are ignored.',
      nextSeqLabel: 'Next serial number (XXXX)',
      saved: 'Saved.',
      loadError: 'Failed to load.',
      saveError: 'Failed to save.',
      dbNext: 'Database next',
      configured: 'Configured',
    },
    dateInput: {
      placeholder: 'DD.MM.YYYY',
      pick: 'pick',
      invalid: 'Invalid date (format: DD.MM.YYYY)',
    },
    customersPage: {
      heading: 'Customers',
      companyNameRequired: 'Company name is required.',
      companyName: 'Company name',
      vatId: 'VAT ID',
      contactName: 'Contact person',
      noCustomers: 'No customers available.',
      company: 'Company',
      place: 'Location',
    },
    employeesPage: {
      heading: 'Employees',
      firstName: 'First name',
      lastName: 'Last name',
      birthDate: 'Birth date',
      hourlyRate: 'Default hourly rate (EUR)',
      weeklyCapacity: 'Weekly capacity (h)',
      availabilityHeading: 'Availability blocks',
      addBlock: 'Add block',
      availabilityStart: 'Start',
      availabilityEnd: 'End',
      availabilityReason: 'Reason',
      noAvailability: 'No availability blocks.',
      nameRequired: 'First and last name are required.',
      availabilityInvalid: 'Every availability block needs a start and end date.',
      noEmployees: 'No employees available.',
      capacity: 'Capacity',
      blocks: 'blocks',
    },
    ordersPage: {
      heading: 'Orders',
      customerRequired: 'Please select a customer.',
      titleRequired: 'Title is required.',
      orderNumber: 'Order number',
      statusOpen: 'open',
      statusPaused: 'paused',
      statusClosed: 'closed',
      hourlyRate: 'Default hourly rate (EUR)',
      noCustomersOption: '(Create a customer first)',
      noOrders: 'No orders available.',
      deleteHint: 'Note: deletion is only possible when no sites or work entries exist (FK rules).',
    },
    orderDetailPage: {
      headingPrefix: 'Order',
      editHeading: 'Edit order',
      deleteOrder: 'Delete order',
      siteNameRequired: 'Site name is required.',
      addSite: 'Create site',
      assignmentHeading: 'Assign employees',
      assignmentSiteRequired: 'Please select a site.',
      assignmentEmployeeRequired: 'Please select an employee.',
      noCustomersOption: '(Create a customer first)',
      noSitesOption: '(Create a site first)',
      noEmployeesOption: '(Create an employee first)',
      noSites: 'No sites available.',
      deleteSitesHint: 'Note: deletion is only possible when no work entries, invoice lines, or assignments exist (FK rules).',
      deleteAssignmentsHint: 'Note: an assignment cannot be deleted if work entries already exist for that site (FK rules).',
      address: 'Address',
      assignedEmployees: 'Employees',
      saveSite: 'Save',
      newSite: 'New',
    },
    sitesPage: {
      heading: 'Sites',
      description: 'Standalone overview and CRUD. Sites are also available inside each order.',
      orderRequired: 'Please select an order.',
      siteNameRequired: 'Site name is required.',
      noOrdersOption: '(Create an order first)',
      noSites: 'No sites available.',
      toOrder: 'Open order',
      deleteHint: 'Note: deletion is only possible when no work entries or assignments exist (FK rules).',
    },
    workEntriesPage: {
      heading: 'Record work entries',
      description: 'Every entry automatically creates a draft invoice except sick, vacation, and holiday entries.',
      requiredSelection: 'Please select employee, order, and site.',
      requiredDate: 'Please choose a date.',
      positiveHours: 'Hours must be greater than 0.',
      noEmployeesOption: '(Create an employee first)',
      noOrdersOption: '(Create an order first)',
      noSitesOption: '(No site available for this order)',
      filterHeading: 'Filter',
      draftInvoice: 'Draft invoice',
      statusHours: 'Hours / Status',
      noEntries: 'No work entries available.',
      deleteHint: 'Note: editing or deleting is only possible while the work entry has not been moved into a non-draft invoice or split across multiple invoices.',
      workStatus: 'Status',
    },
    hoursReportPage: {
      heading: 'Hours report',
      aggregateBy: 'Aggregate by',
      totalHours: 'Total hours',
      noRows: 'No work entries available.',
      source: 'Source: work entries.',
    },
    invoicesPage: {
      heading: 'Invoices',
      statusFilter: 'Status filter',
      all: '(all)',
      toDrafts: 'Go to drafts',
      number: 'No.',
      positions: 'Lines',
      noInvoices: 'No invoices available.',
      deleteHint: 'Note: deletion is only possible for draft invoices.',
    },
    invoiceDraftsPage: {
      heading: 'Draft invoices',
      groupBy: 'Group by',
      totalHours: 'Total hours',
      allInvoices: 'All invoices',
      draftCount: 'Drafts',
      openAndMerge: 'Open & merge',
      noDrafts: 'No draft invoices available.',
      mergeHint: 'Note: merging is only possible when all drafts belong to the same customer and group.',
    },
    invoiceDraftGroupPage: {
      heading: 'Draft group',
      missingKey: 'Missing parameter: key',
      grouping: 'Grouping',
      draftCount: 'Draft count',
      totalHours: 'Total hours',
      positionsDetail: 'Line items (details)',
      noDrafts: 'No drafts.',
      noLines: 'No line items.',
      mergeHeading: 'Merge',
      targetCount: 'Target invoice count',
      targetCountHint: 'Leave empty to create one invoice with all hours automatically.',
      splitHours: 'Hours per invoice (only if count > 1)',
      splitPlaceholder: 'e.g. 4, 6',
      splitHint: 'Note: the sum of splits must equal',
      merge: 'Merge',
      mergeSuccess: 'Merged. New invoice(s):',
      deleteHint: 'Note: individual draft deletion is available under "Invoices" (draft status only). FK rules are active in V2.',
      noDraftFound: 'No drafts found.',
    },
    invoiceDetailPage: {
      heading: 'Invoice',
      customer: 'Customer',
      draftHint: 'Note: drafts do not receive an invoice number. Export is only available after merge/finalize.',
      editHeading: 'Edit invoice',
      invoiceNumber: 'Invoice number',
      issueDate: 'Invoice date',
      fixedAmount: 'Fixed amount (optional)',
      fixedAmountPlaceholder: 'e.g. 4400.00',
      positions: 'Line items',
      noLines: 'No line items.',
      totalHours: 'Total hours',
      totalAmount: 'Total amount',
      deleteHint: 'Note: deletion is only possible for draft invoices.',
      detailedPdf: 'PDF (detailed)',
      fixedPdf: 'PDF (fixed)',
      detailedWord: 'Word (detailed)',
      fixedWord: 'Word (fixed)',
    },
    timesheetPage: {
      heading: 'Timesheets',
      description: 'Monthly overview per employee with PDF and Word export.',
      loadTable: 'Show table',
      selectEmployee: 'Please select an employee.',
      noEmployeesOption: '(Create an employee first)',
      selectPrompt: 'Make a selection and click "Show table".',
      sheetTitle: 'Timesheet',
      worker: 'Employee',
      employer: 'Employer',
      workingTime: 'Working time',
      breakDeducted: '(break deducted)',
      totalHours: 'Total hours',
      monthNames: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    },
    aiIntakePage: {
      intake: 'AI Intake',
      flow: 'Chat -> Proposal -> Team -> Order creation',
      unnamed: 'Untitled intake',
      noCustomer: 'No customer',
      noIntakes: 'No intakes yet.',
      conversation: 'Conversation',
      conversationDesc: 'Captured requirements with Gemini support',
      generateProposal: 'Generate proposal',
      saveDraft: 'Save draft',
      clearConversation: 'Clear messages',
      clearConversationConfirm: 'Clear this conversation? The saved messages for this intake will be removed.',
      noConversation: 'No conversation yet.',
      messagePlaceholder: 'New message for the intake assistant...',
      sendMessage: 'Send message',
      streaming: 'Streaming...',
      assistant: 'Assistant',
      manager: 'Manager',
      proposal: 'Proposal',
      proposalDesc: 'Review and correct manually before creating records.',
      companyName: 'Company name',
      contactName: 'Contact name',
      contactPhone: 'Contact phone',
      contactEmail: 'Contact email',
      orderTitle: 'Order title',
      periodStart: 'Start date',
      periodEnd: 'End date',
      totalHours: 'Total hours',
      requiredSkills: 'Required skills',
      requiredCertifications: 'Required certifications',
      orderDescription: 'Order description',
      addSite: 'Add site',
      siteLabel: 'Site',
      noSites: 'No sites in the proposal yet.',
      recommendations: 'Staff suggestions',
      recommendationsDesc: 'Deterministic selection based on skills, capacity, and history.',
      calculateRecommendations: 'Calculate suggestions',
      noRecommendations: 'No suggestions calculated yet.',
      timeframe: 'Timeframe',
      pricePreview: 'Price preview',
      select: 'Select',
      reason: 'Reason',
      capacity: 'Capacity',
      noMatchingEmployees: 'No suitable employees found.',
      excluded: 'Excluded',
      confirmation: 'Confirmation',
      useExistingCustomer: 'Use existing customer (optional)',
      createNewCustomer: 'Create a new customer from the proposal',
      estimatedPrice: 'Estimated price',
      currency: 'Currency',
      confirm: 'Convert proposal into order',
      orderCreated: 'Created',
      openOrder: 'Open order',
      createIntakeFirst: 'Create an intake first.',
      convertedAlert: 'The proposal was converted into customer and order data.',
      createIntakeFailed: 'Could not create intake.',
      browserStreamingUnsupported: 'Streaming is not supported by this browser.',
      responseFailed: 'Gemini response failed.',
      messageSendFailed: 'Message could not be sent.',
      voiceStart: 'Start recording',
      voiceStop: 'Stop recording',
      voiceCancel: 'Discard recording',
      voiceRecording: 'Recording in progress',
      voiceTranscribing: 'Transcribing audio...',
      voiceReviewHint: 'Transcript inserted. Review it and then send it.',
      voiceUnsupported: 'Voice recording is not supported in this browser.',
      voicePermissionDenied: 'Microphone access was denied.',
      voiceNoMicrophone: 'No microphone was found or it is unavailable.',
      voiceNoSpeech: 'No usable speech was detected in the recording.',
      voiceTooLong: 'The recording was stopped automatically after 90 seconds.',
      voiceTranscriptionFailed: 'Transcription failed.',
      recordingPreview: 'Audio preview',
      recordingDuration: 'Duration',
      recordingPeak: 'Peak',
      recordingSize: 'File size',
      weeksUnit: 'weeks',
      score: 'Score',
      history: 'History',
      entries: 'entries',
      freeHours: 'Free',
      bookedHours: 'Booked',
      assignmentPressure: 'Assignment pressure',
      defaultCapacity: 'Default 40h',
    },
  },
  ar: {
    app: {
      brand: 'فواتير Z&M',
      title: 'بوابة الإدارة',
    },
    nav: {
      dashboard: 'لوحة التحكم',
      customers: 'العملاء',
      orders: 'الطلبات',
      sites: 'المواقع',
      employees: 'الموظفون',
      workEntries: 'ساعات العمل',
      timesheets: 'الجداول الشهرية',
      invoiceDrafts: 'المسودات',
      invoices: 'الفواتير',
      hoursReport: 'تقرير الساعات',
      aiIntake: 'الاستقبال الذكي',
    },
    common: {
      save: 'حفظ',
      create: 'إنشاء',
      createNew: 'جديد',
      edit: 'تعديل',
      delete: 'حذف',
      remove: 'إزالة',
      open: 'فتح',
      back: 'رجوع',
      reset: 'إعادة ضبط',
      refresh: 'تحديث',
      loading: 'جارٍ التحميل...',
      notes: 'ملاحظات',
      description: 'الوصف',
      summary: 'الملخص',
      status: 'الحالة',
      customer: 'العميل',
      customers: 'العملاء',
      order: 'الطلب',
      orders: 'الطلبات',
      site: 'الموقع',
      sites: 'المواقع',
      employee: 'الموظف',
      employees: 'الموظفون',
      contact: 'جهة الاتصال',
      actions: 'الإجراءات',
      city: 'المدينة',
      street: 'الشارع',
      zipCode: 'الرمز البريدي',
      country: 'الدولة',
      phone: 'الهاتف',
      email: 'البريد الإلكتروني',
      date: 'التاريخ',
      hours: 'الساعات',
      skills: 'المهارات',
      certifications: 'الشهادات',
      start: 'البداية',
      end: 'النهاية',
      name: 'الاسم',
      title: 'العنوان',
      noData: 'لا توجد بيانات.',
      deleteConfirm: 'هل تريد حذف هذا السجل؟ إذا كان مرتبطًا ببيانات أخرى فقد يفشل الحذف.',
      none: '-',
      optional: 'اختياري',
      source: 'المصدر',
      yes: 'نعم',
      no: 'لا',
      preview: 'معاينة',
      year: 'السنة',
      group: 'المجموعة',
      details: 'التفاصيل',
      total: 'الإجمالي',
      lines: 'البنود',
      amount: 'المبلغ',
      rate: 'السعر',
      id: 'المعرّف',
      created: 'تاريخ الإنشاء',
      updateSuccess: 'تم الحفظ.',
    },
    theme: {
      switchTitle: 'تبديل المظهر',
      light: 'فاتح',
      dark: 'داكن',
    },
    language: {
      switchTitle: 'تبديل اللغة',
      de: 'ألماني',
      en: 'إنجليزي',
      ar: 'عربي',
    },
    statuses: {
      order: {
        open: 'مفتوح',
        paused: 'متوقف',
        closed: 'مغلق',
      },
      invoice: {
        draft: 'مسودة',
        final: 'نهائي',
        sent: 'مرسل',
        paid: 'مدفوع',
        canceled: 'ملغي',
      },
      workDay: {
        work: 'عمل',
        sick: 'مرض',
        vacation: 'إجازة',
        holiday: 'عطلة',
      },
      groupBy: {
        employee: 'الموظف',
        site: 'الموقع',
        order: 'الطلب',
      },
    },
    dashboard: {
      cards: [
        { href: '/customers', title: 'العملاء', desc: 'إدارة العملاء' },
        { href: '/orders', title: 'الطلبات', desc: 'إنشاء الطلبات ومراجعتها' },
        { href: '/sites', title: 'المواقع', desc: 'إدارة مواقع العمل' },
        { href: '/employees', title: 'الموظفون', desc: 'إدارة الموظفين' },
        { href: '/work-entries', title: 'ساعات العمل', desc: 'تسجيل الساعات وإنشاء مسودات الفواتير' },
        { href: '/invoices/drafts', title: 'مسودات الفواتير', desc: 'تجميع ودمج مسودات الفواتير' },
        { href: '/invoices', title: 'الفواتير', desc: 'جميع الفواتير مع التصدير' },
        { href: '/reports/hours', title: 'تقرير الساعات', desc: 'تجميع حسب الموظف أو الموقع أو الطلب' },
        { href: '/ai-intake', title: 'الاستقبال الذكي', desc: 'إنشاء عروض واقتراح فرق العمل من المحادثة' },
      ],
    },
    invoiceSequence: {
      heading: 'رقم الفاتورة التالي',
      description: 'يمكنك هنا ضبط الرقم التسلسلي التالي لهذه السنة عند الحاجة. يتم تجاهل القيم الأصغر أو غير الصالحة.',
      nextSeqLabel: 'الرقم التسلسلي التالي (XXXX)',
      saved: 'تم الحفظ.',
      loadError: 'فشل التحميل.',
      saveError: 'فشل الحفظ.',
      dbNext: 'القيمة التالية في قاعدة البيانات',
      configured: 'المعين',
    },
    dateInput: {
      placeholder: 'DD.MM.YYYY',
      pick: 'اختيار',
      invalid: 'تاريخ غير صالح (الصيغة: DD.MM.YYYY)',
    },
    customersPage: {
      heading: 'العملاء',
      companyNameRequired: 'اسم الشركة مطلوب.',
      companyName: 'اسم الشركة',
      vatId: 'رقم الضريبة',
      contactName: 'جهة الاتصال',
      noCustomers: 'لا يوجد عملاء.',
      company: 'الشركة',
      place: 'الموقع',
    },
    employeesPage: {
      heading: 'الموظفون',
      firstName: 'الاسم الأول',
      lastName: 'اسم العائلة',
      birthDate: 'تاريخ الميلاد',
      hourlyRate: 'سعر الساعة الافتراضي (EUR)',
      weeklyCapacity: 'السعة الأسبوعية (ساعة)',
      availabilityHeading: 'فترات عدم التوفر',
      addBlock: 'إضافة فترة',
      availabilityStart: 'البداية',
      availabilityEnd: 'النهاية',
      availabilityReason: 'السبب',
      noAvailability: 'لا توجد فترات عدم توفر.',
      nameRequired: 'الاسم الأول واسم العائلة مطلوبان.',
      availabilityInvalid: 'كل فترة عدم توفر تحتاج إلى تاريخ بداية ونهاية.',
      noEmployees: 'لا يوجد موظفون.',
      capacity: 'السعة',
      blocks: 'فترات',
    },
    ordersPage: {
      heading: 'الطلبات',
      customerRequired: 'يرجى اختيار عميل.',
      titleRequired: 'العنوان مطلوب.',
      orderNumber: 'رقم الطلب',
      statusOpen: 'مفتوح',
      statusPaused: 'متوقف',
      statusClosed: 'مغلق',
      hourlyRate: 'سعر الساعة الافتراضي (EUR)',
      noCustomersOption: '(أنشئ عميلًا أولاً)',
      noOrders: 'لا توجد طلبات.',
      deleteHint: 'ملاحظة: يمكن الحذف فقط إذا لم توجد مواقع أو سجلات ساعات مرتبطة.',
    },
    orderDetailPage: {
      headingPrefix: 'الطلب',
      editHeading: 'تعديل الطلب',
      deleteOrder: 'حذف الطلب',
      siteNameRequired: 'اسم الموقع مطلوب.',
      addSite: 'إنشاء موقع',
      assignmentHeading: 'تعيين الموظفين',
      assignmentSiteRequired: 'يرجى اختيار موقع.',
      assignmentEmployeeRequired: 'يرجى اختيار موظف.',
      noCustomersOption: '(أنشئ عميلًا أولاً)',
      noSitesOption: '(أنشئ موقعًا أولاً)',
      noEmployeesOption: '(أنشئ موظفًا أولاً)',
      noSites: 'لا توجد مواقع.',
      deleteSitesHint: 'ملاحظة: يمكن الحذف فقط إذا لم توجد سجلات ساعات أو بنود فواتير أو تعيينات مرتبطة.',
      deleteAssignmentsHint: 'ملاحظة: لا يمكن حذف التعيين إذا وُجدت سجلات ساعات لهذا الموقع.',
      address: 'العنوان',
      assignedEmployees: 'الموظفون',
      saveSite: 'حفظ',
      newSite: 'جديد',
    },
    sitesPage: {
      heading: 'المواقع',
      description: 'عرض مستقل وعمليات CRUD. كما تظهر المواقع داخل كل طلب.',
      orderRequired: 'يرجى اختيار طلب.',
      siteNameRequired: 'اسم الموقع مطلوب.',
      noOrdersOption: '(أنشئ طلبًا أولاً)',
      noSites: 'لا توجد مواقع.',
      toOrder: 'فتح الطلب',
      deleteHint: 'ملاحظة: يمكن الحذف فقط إذا لم توجد سجلات ساعات أو تعيينات مرتبطة.',
    },
    workEntriesPage: {
      heading: 'تسجيل ساعات العمل',
      description: 'كل سجل ينشئ مسودة فاتورة تلقائيًا باستثناء المرض والإجازة والعطلات.',
      requiredSelection: 'يرجى اختيار الموظف والطلب والموقع.',
      requiredDate: 'يرجى اختيار التاريخ.',
      positiveHours: 'يجب أن تكون الساعات أكبر من صفر.',
      noEmployeesOption: '(أنشئ موظفًا أولاً)',
      noOrdersOption: '(أنشئ طلبًا أولاً)',
      noSitesOption: '(لا يوجد موقع لهذا الطلب)',
      filterHeading: 'التصفية',
      draftInvoice: 'مسودة الفاتورة',
      statusHours: 'الساعات / الحالة',
      noEntries: 'لا توجد سجلات ساعات.',
      deleteHint: 'ملاحظة: يمكن التعديل أو الحذف فقط طالما لم يتم نقل السجل إلى فاتورة غير مسودة أو تقسيمه على عدة فواتير.',
      workStatus: 'الحالة',
    },
    hoursReportPage: {
      heading: 'تقرير الساعات',
      aggregateBy: 'تجميع حسب',
      totalHours: 'إجمالي الساعات',
      noRows: 'لا توجد سجلات ساعات.',
      source: 'المصدر: سجلات ساعات العمل.',
    },
    invoicesPage: {
      heading: 'الفواتير',
      statusFilter: 'تصفية الحالة',
      all: '(الكل)',
      toDrafts: 'الانتقال إلى المسودات',
      number: 'الرقم',
      positions: 'البنود',
      noInvoices: 'لا توجد فواتير.',
      deleteHint: 'ملاحظة: الحذف متاح فقط لمسودات الفواتير.',
    },
    invoiceDraftsPage: {
      heading: 'مسودات الفواتير',
      groupBy: 'التجميع حسب',
      totalHours: 'إجمالي الساعات',
      allInvoices: 'كل الفواتير',
      draftCount: 'عدد المسودات',
      openAndMerge: 'فتح ودمج',
      noDrafts: 'لا توجد مسودات فواتير.',
      mergeHint: 'ملاحظة: الدمج متاح فقط إذا كانت كل المسودات لنفس العميل ونفس المجموعة.',
    },
    invoiceDraftGroupPage: {
      heading: 'مجموعة المسودات',
      missingKey: 'المعامل key مفقود',
      grouping: 'التجميع',
      draftCount: 'عدد المسودات',
      totalHours: 'إجمالي الساعات',
      positionsDetail: 'تفاصيل البنود',
      noDrafts: 'لا توجد مسودات.',
      noLines: 'لا توجد بنود.',
      mergeHeading: 'دمج',
      targetCount: 'عدد الفواتير الناتجة',
      targetCountHint: 'اتركه فارغًا لإنشاء فاتورة واحدة تلقائيًا بكل الساعات.',
      splitHours: 'الساعات لكل فاتورة (فقط إذا كان العدد > 1)',
      splitPlaceholder: 'مثال: 4, 6',
      splitHint: 'ملاحظة: يجب أن يساوي مجموع التقسيمات',
      merge: 'دمج',
      mergeSuccess: 'تم الدمج. الفواتير الجديدة:',
      deleteHint: 'ملاحظة: يمكن حذف المسودات الفردية من صفحة "الفواتير" (حالة مسودة فقط).',
      noDraftFound: 'لم يتم العثور على مسودات.',
    },
    invoiceDetailPage: {
      heading: 'الفاتورة',
      customer: 'العميل',
      draftHint: 'ملاحظة: المسودات لا تحصل على رقم فاتورة. التصدير متاح فقط بعد الدمج أو الإنهاء.',
      editHeading: 'تعديل الفاتورة',
      invoiceNumber: 'رقم الفاتورة',
      issueDate: 'تاريخ الفاتورة',
      fixedAmount: 'مبلغ ثابت (اختياري)',
      fixedAmountPlaceholder: 'مثال: 4400.00',
      positions: 'البنود',
      noLines: 'لا توجد بنود.',
      totalHours: 'إجمالي الساعات',
      totalAmount: 'إجمالي المبلغ',
      deleteHint: 'ملاحظة: الحذف متاح فقط لمسودات الفواتير.',
      detailedPdf: 'PDF (تفصيلي)',
      fixedPdf: 'PDF (ثابت)',
      detailedWord: 'Word (تفصيلي)',
      fixedWord: 'Word (ثابت)',
    },
    timesheetPage: {
      heading: 'الجداول الشهرية',
      description: 'عرض شهري لكل موظف مع تصدير PDF و Word.',
      loadTable: 'عرض الجدول',
      selectEmployee: 'يرجى اختيار موظف.',
      noEmployeesOption: '(أنشئ موظفًا أولاً)',
      selectPrompt: 'اختر القيم ثم اضغط "عرض الجدول".',
      sheetTitle: 'جدول الساعات',
      worker: 'الموظف',
      employer: 'صاحب العمل',
      workingTime: 'وقت العمل',
      breakDeducted: '(بعد خصم الاستراحة)',
      totalHours: 'إجمالي الساعات',
      monthNames: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
    },
    aiIntakePage: {
      intake: 'الاستقبال الذكي',
      flow: 'محادثة -> عرض -> فريق -> إنشاء طلب',
      unnamed: 'استقبال بدون عنوان',
      noCustomer: 'بدون عميل',
      noIntakes: 'لا توجد حالات استقبال بعد.',
      conversation: 'المحادثة',
      conversationDesc: 'المتطلبات المسجلة بدعم Gemini',
      generateProposal: 'إنشاء العرض',
      saveDraft: 'حفظ المسودة',
      clearConversation: 'مسح الرسائل',
      clearConversationConfirm: 'هل تريد مسح هذه المحادثة؟ سيتم حذف الرسائل المحفوظة لهذا الإدخال.',
      noConversation: 'لا توجد محادثة بعد.',
      messagePlaceholder: 'رسالة جديدة إلى مساعد الاستقبال...',
      sendMessage: 'إرسال الرسالة',
      streaming: 'جارٍ البث...',
      assistant: 'المساعد',
      manager: 'المدير',
      proposal: 'العرض',
      proposalDesc: 'راجع وصحح يدويًا قبل إنشاء البيانات.',
      companyName: 'اسم الشركة',
      contactName: 'اسم جهة الاتصال',
      contactPhone: 'هاتف جهة الاتصال',
      contactEmail: 'بريد جهة الاتصال',
      orderTitle: 'عنوان الطلب',
      periodStart: 'تاريخ البداية',
      periodEnd: 'تاريخ النهاية',
      totalHours: 'إجمالي الساعات',
      requiredSkills: 'المهارات المطلوبة',
      requiredCertifications: 'الشهادات المطلوبة',
      orderDescription: 'وصف الطلب',
      addSite: 'إضافة موقع',
      siteLabel: 'الموقع',
      noSites: 'لا توجد مواقع في العرض بعد.',
      recommendations: 'اقتراحات الفريق',
      recommendationsDesc: 'اختيار حتمي يعتمد على المهارات والسعة والسجل.',
      calculateRecommendations: 'حساب الاقتراحات',
      noRecommendations: 'لم يتم حساب اقتراحات بعد.',
      timeframe: 'الفترة',
      pricePreview: 'معاينة السعر',
      select: 'اختيار',
      reason: 'السبب',
      capacity: 'السعة',
      noMatchingEmployees: 'لم يتم العثور على موظفين مناسبين.',
      excluded: 'المستبعدون',
      confirmation: 'التأكيد',
      useExistingCustomer: 'استخدام عميل موجود (اختياري)',
      createNewCustomer: 'إنشاء عميل جديد من العرض',
      estimatedPrice: 'السعر التقديري',
      currency: 'العملة',
      confirm: 'تحويل العرض إلى طلب',
      orderCreated: 'تم الإنشاء',
      openOrder: 'فتح الطلب',
      createIntakeFirst: 'أنشئ حالة استقبال أولاً.',
      convertedAlert: 'تم تحويل العرض إلى بيانات عميل وطلب.',
      createIntakeFailed: 'تعذر إنشاء حالة الاستقبال.',
      browserStreamingUnsupported: 'هذا المتصفح لا يدعم البث المباشر.',
      responseFailed: 'فشل رد Gemini.',
      messageSendFailed: 'تعذر إرسال الرسالة.',
      voiceStart: 'بدء التسجيل',
      voiceStop: 'إيقاف التسجيل',
      voiceCancel: 'إلغاء التسجيل',
      voiceRecording: 'التسجيل جارٍ',
      voiceTranscribing: 'جارٍ تحويل الصوت إلى نص...',
      voiceReviewHint: 'تم إدراج النص. راجعه ثم أرسله.',
      voiceUnsupported: 'تسجيل الصوت غير مدعوم في هذا المتصفح.',
      voicePermissionDenied: 'تم رفض الوصول إلى الميكروفون.',
      voiceNoMicrophone: 'لا يوجد ميكروفون متاح أو تم اكتشافه.',
      voiceNoSpeech: 'لم يتم التعرف على نص صالح في التسجيل.',
      voiceTooLong: 'تم إيقاف التسجيل تلقائياً بعد 90 ثانية.',
      voiceTranscriptionFailed: 'فشل تحويل الصوت إلى نص.',
      recordingPreview: 'معاينة الصوت',
      recordingDuration: 'المدة',
      recordingPeak: 'الذروة',
      recordingSize: 'حجم الملف',
      weeksUnit: 'أسابيع',
      score: 'النتيجة',
      history: 'السجل',
      entries: 'إدخالات',
      freeHours: 'متاح',
      bookedHours: 'محجوز',
      assignmentPressure: 'ضغط التعيينات',
      defaultCapacity: 'افتراضي 40س',
    },
  },
};
