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
    workshops: string;
    employees: string;
    workEntries: string;
    timesheets: string;
    invoiceDrafts: string;
    invoices: string;
    hoursReport: string;
    aiIntake: string;
    aiMonitoring: string;
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
    original: string;
    construction: string;
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
  trackingPage: {
    heading: string;
    description: string;
    loading: string;
    refresh: string;
    none: string;
    generalProjectUpdate: string;
    noRecords: string;
    selectedPhotos: string;
    deleteConfirm: string;
    tabs: Record<'overview' | 'baseline' | 'timeline' | 'photos' | 'tasks' | 'issues' | 'materials' | 'team', string>;
    metrics: Record<string, string>;
    aiAnalysis: Record<string, string>;
    labels: Record<string, string>;
    actions: Record<string, string>;
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
    deleteIntake: string;
    deleteIntakeConfirm: string;
    conversation: string;
    conversationDesc: string;
    generateProposal: string;
    exportProposalPdf: string;
    saveDraft: string;
    clearConversation: string;
    clearConversationConfirm: string;
    deleteMessage: string;
    deleteMessageConfirm: string;
    deletingMessage: string;
    clearAllFields: string;
    clearAllFieldsConfirm: string;
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
    notMentioned: string;
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
  authPage: {
    pageTitle: string;
    loginTab: string;
    signupTab: string;
    loginTitle: string;
    signupTitle: string;
    userButtonLabel: string;
    email: string;
    emailPlaceholder: string;
    phone: string;
    phonePlaceholder: string;
    password: string;
    passwordPlaceholder: string;
    confirmPassword: string;
    confirmPasswordPlaceholder: string;
    submitLogin: string;
    submitSignup: string;
    helperText: string;
    validation: {
      emailRequired: string;
      emailInvalid: string;
      passwordRequired: string;
      passwordStrength: string;
      phoneRequired: string;
      phoneInvalid: string;
      confirmRequired: string;
      passwordsMatch: string;
      successSignup: string;
      successLogin: string;
    };
  };
};

export const messages: Record<Locale, Messages> = {
  de: {
    app: {
      brand: 'Omran Portal',
      title: 'Verwaltungsportal',
    },
    nav: {
      dashboard: 'Dashboard',
      customers: 'Kunden',
      orders: 'Auftraege',
      sites: 'Baustellen',
      workshops: 'Workshops',
      employees: 'Mitarbeiter',
      workEntries: 'Arbeitszeiten',
      timesheets: 'Stundentabelle',
      invoiceDrafts: 'Entwuerfe',
      invoices: 'Rechnungen',
      hoursReport: 'Stundenuebersicht',
      aiIntake: 'AI Intake',
      aiMonitoring: 'AI Monitoring',
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
      original: 'Original',
      construction: 'Baustelle',
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
        { href: '/workshops', title: 'Workshops', desc: 'Externe Partner und Gewerke verwalten' },
        { href: '/invoices/drafts', title: 'Entwurf-Rechnungen', desc: 'Gruppieren und zusammenfuehren' },
        { href: '/invoices', title: 'Rechnungen', desc: 'Alle Rechnungen + PDF' },
        { href: '/ai-intake', title: 'AI Intake', desc: 'Chatbasierten Vorschlag mit Workshop-Ausfuehrung erzeugen' },
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
    trackingPage: {
      heading: 'Projektverfolgung',
      description: 'Manuelle Verfolgung fuer Fotos, Fortschritt, Aufgaben, Probleme, Materialien und Werkstattplanung.',
      loading: 'Trackingdaten werden geladen...',
      refresh: 'Aktualisieren',
      none: 'Keine Angabe',
      generalProjectUpdate: 'Allgemeines Projektupdate',
      noRecords: 'Noch keine Eintraege.',
      selectedPhotos: 'Ausgewaehlte Fotos',
      deleteConfirm: 'Tracking-Eintrag loeschen?',
      tabs: { overview: 'Uebersicht', baseline: 'Baseline', timeline: 'Verlauf', photos: 'Fotos', tasks: 'Aufgaben', issues: 'Probleme', materials: 'Materialien', team: 'Werkst?tten' },
      metrics: {
        overallStatus: 'Gesamtstatus', overallStatusSub: 'Aktueller Projektstand', overallProgress: 'Gesamtfortschritt', overallProgressSub: 'Nach erledigten Aufgaben', openIssues: 'Offene Probleme', openIssuesSub: 'Blocker mit Handlungsbedarf', tasksCompleted: 'Erledigte Aufgaben', tasksCompletedSub: 'Checklistenfortschritt', upcomingActions: 'Naechste Aktionen', noUpcomingActions: 'Keine naechsten Aktionen erfasst.', warnings: 'Warnungen', noWarnings: 'Keine aktuellen Warnungen.',
      },
      aiAnalysis: {
        title: 'KI-Projektmonitoring', description: 'Analysiert Trackingdaten, Warnungen, Aufgaben, Probleme und Werkstattplanung.', analyze: 'Projekt analysieren', analyzing: 'Analyse laeuft...', provider: 'Quelle', fallbackNote: 'Regelbasierter Fallback', empty: 'Noch keine KI-Analyse erstellt.', risks: 'Risiken', noRisks: 'Keine Risiken erkannt.', recommendedActions: 'Empfohlene Aktionen', noActions: 'Keine Aktionen empfohlen.', missingInformation: 'Fehlende Informationen', noMissingInformation: 'Keine fehlenden Informationen erkannt.',
      },
      labels: {
        not_started: 'Nicht gestartet', in_progress: 'In Arbeit', waiting_materials: 'Wartet auf Material', blocked: 'Blockiert', needs_review: 'Zur Pruefung', completed: 'Abgeschlossen', resolved: 'Geloest', open: 'Offen', needed: 'Benoetigt', ordered: 'Bestellt', delivered: 'Geliefert', used: 'Verbraucht', low: 'Niedrig', medium: 'Mittel', high: 'Hoch', before: 'Vorher', during: 'Waehrend', after: 'Nachher', issue: 'Problem', material: 'Material', inspection: 'Pruefung', workshop: 'Werkstatt', not_assigned: 'Nicht zugeordnet', missing_schedule: 'Termin fehlt', active: 'Aktiv', upcoming: 'Geplant', past: 'Vergangen', siteArea: 'Baustelle / Bereich', title: 'Titel', status: 'Status', progressPercent: 'Fortschritt %', updateDate: 'Update-Datum', description: 'Beschreibung', nextAction: 'Naechste Aktion', photoTag: 'Foto-Tag', photoCaption: 'Foto-Beschriftung', photos: 'Fotos', caption: 'Beschriftung', task: 'Aufgabe', responsible: 'Verantwortlich', dueDate: 'Faellig am', responsibleName: 'Verantwortlicher Name', notes: 'Notizen', severity: 'Schweregrad', quantity: 'Menge', actions: 'Aktionen', assignedWorkshops: 'Zugeordnete Werkstaetten', coveredTrades: 'Abgedeckte Gewerke', openBlockers: 'Offene Blocker', lastUpdate: 'Letztes Update', complete: 'abgeschlossen', schedule: 'Zeitplan', scheduledWorkshops: 'Geplante Werkstaetten', scheduleWarnings: 'Planungswarnungen', noSites: 'Noch keine Baustellen in diesem Auftrag.', noProgressUpdates: 'Noch keine Fortschrittsupdates.', noPhotos: 'Noch keine Fotos hochgeladen.', noWorkshopAssigned: 'Noch keine Werkstatt fuer diese Baustelle zugeordnet.', projectPhoto: 'Projektfoto', progress: 'Fortschritt', nextActionPrefix: 'Naechste Aktion', addProgressUpdate: 'Fortschrittsupdate hinzufuegen', uploadPhotos: 'Fotos hochladen', addTask: 'Aufgabe hinzufuegen', addIssue: 'Problem oder Blocker hinzufuegen', addMaterial: 'Material erfassen', photoUpdate: 'Foto-Update', materialName: 'Material', noCoveredTrades: 'Keine Gewerke gesetzt', scheduleMissing: 'Termin fehlt', blocked_site: 'Baustelle blockiert', missing_workshop_schedule: 'Werkstatt-Termin fehlt', workshop_unavailable: 'Werkstatt nicht verfuegbar', high_issue: 'Wichtiges offenes Problem', overdue_task: 'Ueberfaellige Aufgabe', no_workshop_assigned: 'Keine Werkstatt zugeordnet', progress_status_mismatch: 'Fortschritt und Status passen nicht zusammen', info: 'Info', whatToDo: 'Was soll ich tun?', openFix: 'Bereich oeffnen', refreshWarnings: 'Neu pruefen', blocked_site_action: 'Problem im Bereich pruefen, verantwortliche Werkstatt festlegen, naechste Aktion erfassen und Status nach Loesung aktualisieren.', missing_workshop_schedule_action: 'Werkstatt-Zuordnung oeffnen und Start- sowie Enddatum eintragen. Keine ueberlappenden Werkstaetten fuer denselben Bereich einplanen.', workshop_unavailable_action: 'Werkstattseite pruefen: Verfuegbarkeit aktualisieren oder eine andere verfuegbare Werkstatt zuordnen.', high_issue_action: 'Tab Probleme oeffnen, Beschreibung und Verantwortlichen pruefen, Loesungsnotiz erfassen und erst nach Behebung auf geloest setzen.', overdue_task_action: 'Tab Aufgaben oeffnen, Faelligkeit oder Status aktualisieren. Wenn erledigt, Aufgabe als abgeschlossen markieren.', no_workshop_assigned_action: 'Werkstattbereich oeffnen und eine passende Werkstatt mit Start- und Enddatum zuordnen.', progress_status_mismatch_action: 'Verlauf oeffnen und ein neues Fortschrittsupdate erfassen, damit Status und Prozentwert zusammenpassen.', fixedPriceNote: 'Festpreis-Notiz / alter Stundensatz', workshopExecution: 'Werkstatt-Ausfuehrung', editWorkshopAssignment: 'Werkstatt-Zuordnung bearbeiten', workshopExecutionDescription: 'Ordne vertrauenswuerdige Werkstaetten je Baustelle oder Arbeitspaket zu. Interne Mitarbeiterzuweisung ist nicht mehr Teil des Hauptflows.', editWorkshopAssignmentDescription: 'Aktualisiere Zeitplan, Status, Umfang oder Notizen der bestehenden Werkstatt-Zuordnung, ohne Duplikate zu erstellen.', manageWorkshops: 'Werkstaetten verwalten', workshopUnavailable: 'nicht verfuegbar', noAvailableWorkshops: 'Keine verfuegbaren Werkstaetten', planned: 'Geplant', assigned: 'Zugeordnet', canceled: 'Abgebrochen', startDate: 'Startdatum', endDate: 'Enddatum', coveredTradesScope: 'Abgedeckte Gewerke / Umfang', coveredTradesPlaceholder: 'Fliesen, Abdichtung, Maler', saveWorkshopAssignment: 'Werkstatt-Zuordnung speichern', assignWorkshop: 'Werkstatt zuordnen', cancelEdit: 'Bearbeitung abbrechen', selectSiteRequired: 'Bitte Baustelle auswaehlen.', selectWorkshopRequired: 'Bitte Werkstatt auswaehlen.', selectWorkshopDatesRequired: 'Bitte Start- und Enddatum der Werkstatt auswaehlen.', healthy: 'Gesund', watch: 'Beobachten', at_risk: 'Gefaehrdet', baseline: 'Baseline', baselineDescription: 'Geplante Termine, Soll/Ist-Fortschritt und Verzoegerungsprognose je Baustelle.', suggestBaseline: 'Baseline vorschlagen', suggestingBaseline: 'Baseline wird vorgeschlagen...', baselineStatus: 'Baseline-Status', baselineStartDate: 'Geplanter Start', baselineEndDate: 'Geplantes Ende', plannedProgress: 'Soll-Fortschritt', actualProgress: 'Ist-Fortschritt', weightedProgress: 'Gewichteter Aufgabenfortschritt', behindScheduleSites: 'Verspaetete Baustellen', delayPrediction: 'Verzoegerungsprognose', progressDelta: 'Abweichung', predictedFinish: 'Prognostiziertes Ende', delayDays: 'Verzugstage', delayStatus: 'Verzugsstatus', saveBaseline: 'Baseline speichern', confirmBaseline: 'Baseline bestaetigen', draft: 'Entwurf', confirmed: 'Bestaetigt', ai_suggested: 'KI-vorgeschlagen', manual: 'Manuell', on_track: 'Im Plan', delayed: 'Verspaetet', unknown: 'Unbekannt', weightPercent: 'Gewicht %', taskProgressPercent: 'Aufgabenfortschritt %', baseline_missing: 'Baseline fehlt', baseline_not_confirmed: 'Baseline nicht bestaetigt', behind_schedule: 'Hinter Plan', predicted_delay: 'Verzoegerung prognostiziert', no_progress_velocity: 'Keine Fortschrittsgeschwindigkeit', task_weights_missing: 'Aufgabengewichte fehlen', baseline_missing_action: 'Baseline-Tab oeffnen und geplante Start-/Enddaten je Baustelle erfassen oder vorschlagen lassen.', baseline_not_confirmed_action: 'Baseline-Daten pruefen und bestaetigen, damit sie fuer Plan/Ist-Vergleiche zaehlen.', behind_schedule_action: 'Aufgabenfortschritt, Blocker, Materialien und Werkstattplan pruefen.', predicted_delay_action: 'Prognostiziertes Ende pruefen und Plan oder Ausfuehrung anpassen.', no_progress_velocity_action: 'Aufgabenfortschritt oder Fortschrittsupdate erfassen, damit eine Prognose moeglich ist.', task_weights_missing_action: 'Aufgabengewichte eintragen, um den Fortschritt genauer zu berechnen.', openTracking: 'Tracking oeffnen', openMonitoring: 'KI-Monitoring oeffnen', progressConfidence: 'Fortschrittsvertrauen', progressSignals: 'Fortschrittssignale', weighted_tasks: 'Gewichtete Aufgaben', manual_update: 'Manuelles Update', none: 'Keine Daten', openAlerts: 'Offene Warnmeldungen', openAlertsDescription: 'Automatisch aus Verzug, Blockern und fehlenden Daten erstellt.', noOpenAlerts: 'Keine offenen Warnmeldungen.', resolveAlert: 'Warnung erledigen', monitoringHistory: 'Monitoring-Historie', monitoringHistoryDescription: 'Gespeicherte KI-Monitoringberichte fuer diesen Auftrag.', noMonitoringHistory: 'Noch keine Monitoringberichte gespeichert.', saving: 'Speichern...',
      },
      actions: { saving: 'Speichern...', addUpdate: 'Update hinzufuegen', uploading: 'Hochladen...', uploadPhotos: 'Fotos hochladen', complete: 'Erledigt', delete: 'Loeschen', resolve: 'Loesen', delivered: 'Geliefert', addTask: 'Aufgabe hinzufuegen', saveTask: 'Aufgabe speichern', addIssue: 'Problem hinzufuegen', addMaterial: 'Material hinzufuegen' },
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
      deleteIntake: 'Intake loeschen',
      deleteIntakeConfirm: 'Diesen Intake vollstaendig loeschen? Nachrichten und Intake-Daten werden entfernt. Bereits erstellte Kunden und Auftraege bleiben erhalten.',
      conversation: 'Konversation',
      conversationDesc: 'Erfasste Anforderungen mit Gemini-Unterstuetzung',
      generateProposal: 'Vorschlag erzeugen',
      exportProposalPdf: 'PDF erzeugen',
      saveDraft: 'Entwurf speichern',
      clearConversation: 'Nachrichten leeren',
      clearConversationConfirm: 'Konversation wirklich leeren? Die gespeicherten Nachrichten dieses Intakes werden entfernt.',
      deleteMessage: 'Nachricht loeschen',
      deleteMessageConfirm: 'Diese Nachricht wirklich loeschen? Die Intake-Daten werden aus den verbleibenden Nachrichten neu aufgebaut.',
      deletingMessage: 'Wird geloescht...',
      clearAllFields: 'Alle Felder leeren',
      clearAllFieldsConfirm: 'Alle Felder dieses Intakes leeren? Nachrichten und der Intake-Eintrag bleiben erhalten.',
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
      notMentioned: 'Nicht erwaehnt',
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
    authPage: {
      pageTitle: 'Anmelden oder Konto erstellen',
      loginTab: 'Anmelden',
      signupTab: 'Registrieren',
      loginTitle: 'Willkommen zurück',
      signupTitle: 'Neues Konto erstellen',
      userButtonLabel: 'Benutzerkonto',
      email: 'E-Mail',
      emailPlaceholder: 'name@beispiel.de',
      phone: 'Telefon',
      phonePlaceholder: '+49 151 23456789',
      password: 'Passwort',
      passwordPlaceholder: 'Min. 8 Zeichen, Zahl & Sonderzeichen',
      confirmPassword: 'Passwort bestätigen',
      confirmPasswordPlaceholder: 'Passwort wiederholen',
      submitLogin: 'Anmelden',
      submitSignup: 'Registrieren',
      helperText: 'Indem Sie fortfahren, stimmen Sie unseren Bedingungen zu.',
      validation: {
        emailRequired: 'E-Mail ist erforderlich.',
        emailInvalid: 'Ungültige E-Mail-Adresse.',
        passwordRequired: 'Passwort ist erforderlich.',
        passwordStrength: 'Passwort muss mindestens 8 Zeichen, eine Zahl und ein Sonderzeichen enthalten.',
        phoneRequired: 'Telefonnummer ist erforderlich.',
        phoneInvalid: 'Ungültige Telefonnummer.',
        confirmRequired: 'Bitte bestätigen Sie das Passwort.',
        passwordsMatch: 'Passwörter stimmen nicht überein.',
        successSignup: 'Registrierung erfolgreich.',
        successLogin: 'Anmeldung erfolgreich.',
      },
    }
  },
  en: {
    app: {
      brand: 'Omran Billing',
      title: 'Management Portal',
    },
    nav: {
      dashboard: 'Dashboard',
      customers: 'Customers',
      orders: 'Orders',
      sites: 'Sites',
      workshops: 'Workshops',
      employees: 'Employees',
      workEntries: 'Work Entries',
      timesheets: 'Timesheets',
      invoiceDrafts: 'Drafts',
      invoices: 'Invoices',
      hoursReport: 'Hours Report',
      aiIntake: 'AI Intake',
      aiMonitoring: 'AI Monitoring',
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
      original: 'Original',
      construction: 'Construction',
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
        { href: '/workshops', title: 'Workshops', desc: 'Manage subcontractor partners and trades' },
        { href: '/invoices/drafts', title: 'Draft Invoices', desc: 'Group and merge draft invoices' },
        { href: '/invoices', title: 'Invoices', desc: 'All invoices with exports' },
        { href: '/ai-intake', title: 'AI Intake', desc: 'Create proposal drafts with workshop execution from chat' },
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
    trackingPage: {
      heading: 'Project Tracking',
      description: 'Manual tracking for photos, progress, tasks, issues, materials, and workshop scheduling.',
      loading: 'Loading tracking data...',
      refresh: 'Refresh',
      none: 'None',
      generalProjectUpdate: 'General project update',
      noRecords: 'No records yet.',
      selectedPhotos: 'Selected photos',
      deleteConfirm: 'Delete this tracking item?',
      tabs: { overview: 'Overview', baseline: 'Baseline', timeline: 'Timeline', photos: 'Photos', tasks: 'Tasks', issues: 'Issues', materials: 'Materials', team: 'Workshops' },
      metrics: {
        overallStatus: 'Overall Status', overallStatusSub: 'Latest project state', overallProgress: 'Overall Progress', overallProgressSub: 'Based on completed tasks', openIssues: 'Open Issues', openIssuesSub: 'Blockers needing action', tasksCompleted: 'Tasks Completed', tasksCompletedSub: 'Checklist completion', upcomingActions: 'Upcoming Actions', noUpcomingActions: 'No upcoming actions recorded.', warnings: 'Warnings', noWarnings: 'No active warnings.',
      },
      aiAnalysis: {
        title: 'AI Project Monitoring', description: 'Analyzes tracking data, warnings, tasks, issues, and workshop planning.', analyze: 'Analyze project status', analyzing: 'Analyzing...', provider: 'Provider', fallbackNote: 'Rule-based fallback', empty: 'No AI analysis generated yet.', risks: 'Risks', noRisks: 'No risks detected.', recommendedActions: 'Recommended actions', noActions: 'No actions recommended.', missingInformation: 'Missing information', noMissingInformation: 'No missing information detected.',
      },
      labels: {
        not_started: 'Not Started', in_progress: 'In Progress', waiting_materials: 'Waiting Materials', blocked: 'Blocked', needs_review: 'Needs Review', completed: 'Completed', resolved: 'Resolved', open: 'Open', needed: 'Needed', ordered: 'Ordered', delivered: 'Delivered', used: 'Used', low: 'Low', medium: 'Medium', high: 'High', before: 'Before', during: 'During', after: 'After', issue: 'Issue', material: 'Material', inspection: 'Inspection', workshop: 'Workshop', not_assigned: 'Not Assigned', missing_schedule: 'Schedule Missing', active: 'Active', upcoming: 'Upcoming', past: 'Past', siteArea: 'Site / Area', title: 'Title', status: 'Status', progressPercent: 'Progress %', updateDate: 'Update Date', description: 'Description', nextAction: 'Next Action', photoTag: 'Photo Tag', photoCaption: 'Photo Caption', photos: 'Photos', caption: 'Caption', task: 'Task', responsible: 'Responsible', dueDate: 'Due Date', responsibleName: 'Responsible Name', notes: 'Notes', severity: 'Severity', quantity: 'Quantity', actions: 'Actions', assignedWorkshops: 'Assigned workshops', coveredTrades: 'Covered trades', openBlockers: 'Open blockers', lastUpdate: 'Last update', complete: 'complete', schedule: 'Schedule', scheduledWorkshops: 'Scheduled workshops', scheduleWarnings: 'Schedule warnings', noSites: 'No sites available for this order yet.', noProgressUpdates: 'No progress updates yet.', noPhotos: 'No photos uploaded yet.', noWorkshopAssigned: 'No workshop assigned to this site yet.', projectPhoto: 'Project photo', progress: 'Progress', nextActionPrefix: 'Next action', addProgressUpdate: 'Add Progress Update', uploadPhotos: 'Upload Photos', addTask: 'Add Task', addIssue: 'Add Issue Or Blocker', addMaterial: 'Add Material Log', photoUpdate: 'Photo update', materialName: 'Material', noCoveredTrades: 'No covered trades set', scheduleMissing: 'Schedule missing', blocked_site: 'Site blocked', missing_workshop_schedule: 'Workshop schedule missing', workshop_unavailable: 'Workshop unavailable', high_issue: 'High severity issue open', overdue_task: 'Overdue task', no_workshop_assigned: 'No workshop assigned', progress_status_mismatch: 'Progress and status mismatch', info: 'Info', whatToDo: 'What should I do?', openFix: 'Open fix area', refreshWarnings: 'Check again', blocked_site_action: 'Review the site issue, assign the responsible workshop, add the next action, and update the site status after the blocker is solved.', missing_workshop_schedule_action: 'Open the workshop assignment and add start/end dates. Do not schedule overlapping workshops on the same site.', workshop_unavailable_action: 'Check the Workshops page: update availability or assign another available workshop.', high_issue_action: 'Open the Issues tab, review the description and owner, add a resolution note, then resolve it only after the fix is done.', overdue_task_action: 'Open the Tasks tab, update the due date or status. If the work is done, mark the task as completed.', no_workshop_assigned_action: 'Open the Team tab and assign a matching workshop with start and end dates.', progress_status_mismatch_action: 'Open the Timeline tab and add a progress update so status and percentage match.', fixedPriceNote: 'Fixed-price note / legacy hourly rate', workshopExecution: 'Workshop execution', editWorkshopAssignment: 'Edit workshop assignment', workshopExecutionDescription: 'Assign trusted workshops to each site or work package. Employee assignment is no longer part of the main workflow.', editWorkshopAssignmentDescription: 'Update the existing workshop schedule, status, covered scope, or notes. This fixes schedule warnings without creating duplicate assignments.', manageWorkshops: 'Manage workshops', workshopUnavailable: 'not available', noAvailableWorkshops: 'No available workshops', planned: 'Planned', assigned: 'Assigned', canceled: 'Canceled', startDate: 'Start date', endDate: 'End date', coveredTradesScope: 'Covered trades / scope', coveredTradesPlaceholder: 'tiles, waterproofing, painting', saveWorkshopAssignment: 'Save workshop assignment', assignWorkshop: 'Assign workshop', cancelEdit: 'Cancel edit', selectSiteRequired: 'Please select a site.', selectWorkshopRequired: 'Please select a workshop.', selectWorkshopDatesRequired: 'Please select workshop start and end dates.', healthy: 'Healthy', watch: 'Watch', at_risk: 'At Risk', baseline: 'Baseline', baselineDescription: 'Planned dates, planned vs actual progress, and delay forecast per site.', suggestBaseline: 'Suggest baseline', suggestingBaseline: 'Suggesting baseline...', baselineStatus: 'Baseline status', baselineStartDate: 'Planned start', baselineEndDate: 'Planned end', plannedProgress: 'Planned progress', actualProgress: 'Actual progress', weightedProgress: 'Weighted task progress', behindScheduleSites: 'Behind schedule sites', delayPrediction: 'Delay prediction', progressDelta: 'Progress delta', predictedFinish: 'Predicted finish', delayDays: 'Delay days', delayStatus: 'Delay status', saveBaseline: 'Save baseline', confirmBaseline: 'Confirm baseline', draft: 'Draft', confirmed: 'Confirmed', ai_suggested: 'AI suggested', manual: 'Manual', on_track: 'On track', delayed: 'Delayed', unknown: 'Unknown', weightPercent: 'Weight %', taskProgressPercent: 'Task progress %', baseline_missing: 'Baseline missing', baseline_not_confirmed: 'Baseline not confirmed', behind_schedule: 'Behind schedule', predicted_delay: 'Predicted delay', no_progress_velocity: 'No progress velocity', task_weights_missing: 'Task weights missing', baseline_missing_action: 'Open the Baseline tab and add or suggest planned start/end dates per site.', baseline_not_confirmed_action: 'Review and confirm baseline dates before using them for planned-vs-actual control.', behind_schedule_action: 'Review task progress, blockers, materials, and workshop schedule for this site.', predicted_delay_action: 'Review the predicted finish date and adjust the plan or execution actions.', no_progress_velocity_action: 'Add task progress or a progress update so the system can forecast completion.', task_weights_missing_action: 'Add task weights to improve automatic progress calculation.', openTracking: 'Open Tracking', openMonitoring: 'Open AI Monitoring', progressConfidence: 'Progress confidence', progressSignals: 'Progress signals', weighted_tasks: 'Weighted tasks', manual_update: 'Manual update', none: 'No data', openAlerts: 'Open alerts', openAlertsDescription: 'Automatically created from delay, blocker, and missing-data warnings.', noOpenAlerts: 'No open alerts.', resolveAlert: 'Resolve alert', monitoringHistory: 'Monitoring history', monitoringHistoryDescription: 'Saved AI monitoring reports for this order.', noMonitoringHistory: 'No monitoring reports saved yet.', saving: 'Saving...',
      },
      actions: { saving: 'Saving...', addUpdate: 'Add Update', uploading: 'Uploading...', uploadPhotos: 'Upload Photos', complete: 'Complete', delete: 'Delete', resolve: 'Resolve', delivered: 'Delivered', addTask: 'Add Task', saveTask: 'Save Task', addIssue: 'Add Issue', addMaterial: 'Add Material' },
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
      deleteIntake: 'Delete intake',
      deleteIntakeConfirm: 'Delete this intake completely? Its messages and intake data will be removed. Already-created customers and orders will remain.',
      conversation: 'Conversation',
      conversationDesc: 'Captured requirements with Gemini support',
      generateProposal: 'Generate proposal',
      exportProposalPdf: 'Generate PDF',
      saveDraft: 'Save draft',
      clearConversation: 'Clear messages',
      clearConversationConfirm: 'Clear this conversation? The saved messages for this intake will be removed.',
      deleteMessage: 'Delete message',
      deleteMessageConfirm: 'Delete this message? Intake memory will be rebuilt from the remaining messages.',
      deletingMessage: 'Deleting...',
      clearAllFields: 'Clear all fields',
      clearAllFieldsConfirm: 'Clear all fields for this intake? Messages and the intake record will be kept.',
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
      notMentioned: 'Not mentioned',
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
    authPage: {
      pageTitle: 'Sign in or create account',
      loginTab: 'Login',
      signupTab: 'Sign up',
      loginTitle: 'Welcome back',
      signupTitle: 'Create your account',
      userButtonLabel: 'User',
      email: 'Email',
      emailPlaceholder: 'name@example.com',
      phone: 'Phone',
      phonePlaceholder: '+49 151 23456789',
      password: 'Password',
      passwordPlaceholder: 'At least 8 characters, number & symbol',
      confirmPassword: 'Confirm password',
      confirmPasswordPlaceholder: 'Repeat password',
      submitLogin: 'Sign in',
      submitSignup: 'Create account',
      helperText: 'By continuing you agree to the terms.',
      validation: {
        emailRequired: 'Email is required.',
        emailInvalid: 'Invalid email address.',
        passwordRequired: 'Password is required.',
        passwordStrength: 'Password must be at least 8 characters and include a number and a special character.',
        phoneRequired: 'Phone number is required.',
        phoneInvalid: 'Invalid phone number.',
        confirmRequired: 'Please confirm your password.',
        passwordsMatch: 'Passwords do not match.',
        successSignup: 'Signup successful.',
        successLogin: 'Login successful.',
      },
    },
  },
  ar: {
    app: {
      brand: 'بوابة عمران',
      title: 'بوابة الإدارة',
    },
    nav: {
      dashboard: 'لوحة التحكم',
      customers: 'العملاء',
      orders: 'الطلبات',
      sites: 'المواقع',
      workshops: 'الورش',
      employees: 'الموظفون',
      workEntries: 'ساعات العمل',
      timesheets: 'الجداول الشهرية',
      invoiceDrafts: 'المسودات',
      invoices: 'الفواتير',
      hoursReport: 'تقرير الساعات',
      aiIntake: 'الاستقبال الذكي',
      aiMonitoring: 'المراقبة الذكية',
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
      original: 'الأصلي',
      construction: 'عمراني',
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
        { href: '/workshops', title: 'الورش', desc: 'إدارة الورش الخارجية والاختصاصات' },
        { href: '/invoices/drafts', title: 'مسودات الفواتير', desc: 'تجميع ودمج مسودات الفواتير' },
        { href: '/invoices', title: 'الفواتير', desc: 'جميع الفواتير مع التصدير' },
        { href: '/ai-intake', title: 'الاستقبال الذكي', desc: 'إنشاء عروض مع تنفيذ الورش من المحادثة' },
      ],
    },
    invoiceSequence: {
      heading: 'رقم الفاتورة التالي',
      description: 'يمكنك هنا ضبط الرقم التسلسلي التالي لهذه السنة عند الحاجة. يتم تجاهل القيم الأصغر أو غير الصالحة.',
      nextSeqLabel: 'الرقم التسلسلي التالي (٠٠٠٠)',
      saved: 'تم الحفظ.',
      loadError: 'فشل التحميل.',
      saveError: 'فشل الحفظ.',
      dbNext: 'القيمة التالية في قاعدة البيانات',
      configured: 'المعين',
    },
    dateInput: {
      placeholder: 'يوم.شهر.سنة',
      pick: 'اختيار',
      invalid: 'تاريخ غير صالح (الصيغة: يوم.شهر.سنة)',
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
      hourlyRate: 'سعر الساعة الافتراضي (يورو)',
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
      hourlyRate: 'سعر الساعة الافتراضي (يورو)',
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
    trackingPage: {
      'heading': 'متابعة المشروع',
      'description': 'متابعة يدوية للصور، التقدم، المهام، المشاكل، المواد، وجدولة الورش.',
      'loading': 'جار تحميل بيانات المتابعة...',
      'refresh': 'تحديث',
      'none': 'غير مذكور',
      'generalProjectUpdate': 'تحديث عام للمشروع',
      'noRecords': 'لا توجد سجلات بعد.',
      'selectedPhotos': 'الصور المختارة',
      'deleteConfirm': 'هل تريد حذف عنصر المتابعة؟',
      'tabs': {
            'overview': 'نظرة عامة',
            'baseline': 'الخطة الأساسية',
            'timeline': 'الخط الزمني',
            'photos': 'الصور',
            'tasks': 'المهام',
            'issues': 'المشاكل',
            'materials': 'المواد',
            'team': 'الورش'
      },
      'metrics': {
            'overallStatus': 'الحالة العامة',
            'overallStatusSub': 'آخر حالة للمشروع',
            'overallProgress': 'التقدم العام',
            'overallProgressSub': 'حسب المهام المنجزة',
            'openIssues': 'المشاكل المفتوحة',
            'openIssuesSub': 'عوائق تحتاج متابعة',
            'tasksCompleted': 'المهام المنجزة',
            'tasksCompletedSub': 'تقدم قائمة المهام',
            'upcomingActions': 'الإجراءات القادمة',
            'noUpcomingActions': 'لا توجد إجراءات قادمة مسجلة.',
            'warnings': 'التحذيرات',
            'noWarnings': 'لا توجد تحذيرات حالياً.'
      },
      'aiAnalysis': {
            'title': 'مراقبة المشروع بالذكاء الاصطناعي',
            'description': 'تحلل بيانات التتبع والتحذيرات والمهام والمشاكل وجدولة الورش.',
            'analyze': 'تحليل حالة المشروع',
            'analyzing': 'جار التحليل...',
            'provider': 'المصدر',
            'fallbackNote': 'تحليل احتياطي بالقواعد',
            'empty': 'لم يتم إنشاء تحليل بعد.',
            'risks': 'المخاطر',
            'noRisks': 'لم يتم اكتشاف مخاطر.',
            'recommendedActions': 'الإجراءات المقترحة',
            'noActions': 'لا توجد إجراءات مقترحة.',
            'missingInformation': 'معلومات ناقصة',
            'noMissingInformation': 'لا توجد معلومات ناقصة.'
      },
      'labels': {
            'not_started': 'لم يبدأ',
            'in_progress': 'قيد التنفيذ',
            'waiting_materials': 'بانتظار المواد',
            'blocked': 'متوقف',
            'needs_review': 'بحاجة مراجعة',
            'completed': 'مكتمل',
            'resolved': 'محلول',
            'open': 'مفتوح',
            'needed': 'مطلوب',
            'ordered': 'تم الطلب',
            'delivered': 'تم التسليم',
            'used': 'مستخدم',
            'low': 'منخفض',
            'medium': 'متوسط',
            'high': 'عالٍ',
            'before': 'قبل',
            'during': 'أثناء',
            'after': 'بعد',
            'issue': 'مشكلة',
            'material': 'مادة',
            'inspection': 'فحص',
            'workshop': 'ورشة',
            'not_assigned': 'غير معين',
            'missing_schedule': 'الجدول غير محدد',
            'active': 'نشط',
            'upcoming': 'قادم',
            'past': 'سابق',
            'siteArea': 'الموقع / المنطقة',
            'title': 'العنوان',
            'status': 'الحالة',
            'progressPercent': 'نسبة التقدم %',
            'updateDate': 'تاريخ التحديث',
            'description': 'الوصف',
            'nextAction': 'الإجراء التالي',
            'photoTag': 'وسم الصورة',
            'photoCaption': 'تعليق الصورة',
            'photos': 'الصور',
            'caption': 'التعليق',
            'task': 'المهمة',
            'responsible': 'المسؤول',
            'dueDate': 'تاريخ الاستحقاق',
            'responsibleName': 'اسم المسؤول',
            'notes': 'ملاحظات',
            'severity': 'الخطورة',
            'quantity': 'الكمية',
            'actions': 'الإجراءات',
            'assignedWorkshops': 'الورش المعينة',
            'coveredTrades': 'الأعمال المغطاة',
            'openBlockers': 'العوائق المفتوحة',
            'lastUpdate': 'آخر تحديث',
            'complete': 'مكتمل',
            'schedule': 'الجدول',
            'scheduledWorkshops': 'الورش المجدولة',
            'scheduleWarnings': 'تحذيرات الجدولة',
            'noSites': 'لا توجد مواقع لهذا الطلب بعد.',
            'noProgressUpdates': 'لا توجد تحديثات تقدم بعد.',
            'noPhotos': 'لم يتم رفع صور بعد.',
            'noWorkshopAssigned': 'لا توجد ورشة معينة لهذا الموقع بعد.',
            'projectPhoto': 'صورة المشروع',
            'progress': 'التقدم',
            'nextActionPrefix': 'الإجراء التالي',
            'addProgressUpdate': 'إضافة تحديث تقدم',
            'uploadPhotos': 'رفع الصور',
            'addTask': 'إضافة مهمة',
            'addIssue': 'إضافة مشكلة أو عائق',
            'addMaterial': 'إضافة سجل مادة',
            'photoUpdate': 'تحديث صور',
            'materialName': 'المادة',
            'noCoveredTrades': 'لا توجد أعمال محددة',
            'scheduleMissing': 'الجدول غير محدد',
            'blocked_site': 'الموقع متوقف',
            'missing_workshop_schedule': 'جدول الورشة غير محدد',
            'workshop_unavailable': 'الورشة غير متاحة',
            'high_issue': 'مشكلة عالية الخطورة مفتوحة',
            'overdue_task': 'مهمة متأخرة',
            'info': 'معلومات',
            'whatToDo': 'ماذا يجب أن أفعل؟',
            'blocked_site_action': 'راجع مشكلة الموقع، حدد الورشة المسؤولة، أضف الإجراء التالي، ثم حدّث حالة الموقع بعد حل العائق.',
            'missing_workshop_schedule_action': 'افتح تعيين الورشة وأضف تاريخ البداية والنهاية. لا تضع ورشتين بوقت متداخل على نفس الموقع.',
            'workshop_unavailable_action': 'راجع صفحة الورش: حدّث توفر الورشة أو اختر ورشة أخرى متاحة.',
            'high_issue_action': 'افتح تبويب المشاكل، راجع الوصف والمسؤول، أضف ملاحظة الحل، ثم اجعلها محلولة بعد التنفيذ.',
            'overdue_task_action': 'افتح تبويب المهام، حدّث تاريخ الاستحقاق أو الحالة. إذا انتهى العمل، علّم المهمة كمكتملة.',
            'no_workshop_assigned': 'لا توجد ورشة معينة',
            'progress_status_mismatch': 'عدم توافق التقدم مع الحالة',
            'no_workshop_assigned_action': 'افتح تبويب الورش وعيّن ورشة مناسبة مع تاريخ بداية ونهاية.',
            'progress_status_mismatch_action': 'افتح تبويب الجدول الزمني وأضف تحديث تقدم جديد حتى تتطابق الحالة مع النسبة.',
            'fixedPriceNote': 'ملاحظة السعر الثابت / السعر الساعي القديم',
            'workshopExecution': 'تنفيذ الورش',
            'editWorkshopAssignment': 'تعديل تعيين الورشة',
            'workshopExecutionDescription': 'عيّن الورش الموثوقة لكل موقع أو حزمة عمل. تعيين الموظفين الداخليين لم يعد جزءاً من المسار الأساسي.',
            'editWorkshopAssignmentDescription': 'حدّث جدول الورشة أو الحالة أو نطاق العمل أو الملاحظات بدون إنشاء تعيين مكرر.',
            'manageWorkshops': 'إدارة الورش',
            'workshopUnavailable': 'غير متاحة',
            'noAvailableWorkshops': 'لا توجد ورش متاحة',
            'planned': 'مخطط',
            'assigned': 'معين',
            'canceled': 'ملغى',
            'startDate': 'تاريخ البداية',
            'endDate': 'تاريخ النهاية',
            'coveredTradesScope': 'الأعمال المغطاة / النطاق',
            'coveredTradesPlaceholder': 'بلاط، عزل مائي، دهان',
            'saveWorkshopAssignment': 'حفظ تعيين الورشة',
            'assignWorkshop': 'تعيين ورشة',
            'cancelEdit': 'إلغاء التعديل',
            'selectSiteRequired': 'يرجى اختيار موقع.',
            'selectWorkshopRequired': 'يرجى اختيار ورشة.',
            'selectWorkshopDatesRequired': 'يرجى اختيار تاريخ بداية ونهاية الورشة.',
            'healthy': 'سليم',
            'watch': 'بحاجة متابعة',
            'at_risk': 'معرّض للخطر',
            'baseline': 'الخطة الأساسية',
            'baselineDescription': 'تواريخ التخطيط، مقارنة المخطط مع الفعلي، وتوقع التأخير لكل موقع.',
            'suggestBaseline': 'اقتراح خطة أساسية',
            'suggestingBaseline': 'جار اقتراح الخطة...',
            'baselineStatus': 'حالة الخطة الأساسية',
            'baselineStartDate': 'البداية المخططة',
            'baselineEndDate': 'النهاية المخططة',
            'plannedProgress': 'التقدم المخطط',
            'actualProgress': 'التقدم الفعلي',
            'weightedProgress': 'تقدم المهام الموزون',
            'behindScheduleSites': 'مواقع متأخرة عن الخطة',
            'delayPrediction': 'توقع التأخير',
            'progressDelta': 'فرق التقدم',
            'predictedFinish': 'النهاية المتوقعة',
            'delayDays': 'أيام التأخير',
            'delayStatus': 'حالة التأخير',
            'saveBaseline': 'حفظ الخطة الأساسية',
            'confirmBaseline': 'تأكيد الخطة الأساسية',
            'draft': 'مسودة',
            'confirmed': 'مؤكدة',
            'ai_suggested': 'مقترحة بالذكاء الاصطناعي',
            'manual': 'يدوي',
            'on_track': 'ضمن الخطة',
            'delayed': 'متأخر',
            'unknown': 'غير معروف',
            'weightPercent': 'الوزن %',
            'taskProgressPercent': 'تقدم المهمة %',
            'baseline_missing': 'الخطة الأساسية غير موجودة',
            'baseline_not_confirmed': 'الخطة الأساسية غير مؤكدة',
            'behind_schedule': 'متأخر عن الخطة',
            'predicted_delay': 'تأخير متوقع',
            'no_progress_velocity': 'لا توجد سرعة تقدم كافية',
            'task_weights_missing': 'أوزان المهام غير مكتملة',
            'baseline_missing_action': 'افتح تبويب الخطة الأساسية وأضف أو اقترح تواريخ البداية والنهاية لكل موقع.',
            'baseline_not_confirmed_action': 'راجع تواريخ الخطة الأساسية وأكدها قبل استخدامها في مقارنة المخطط مع الفعلي.',
            'behind_schedule_action': 'راجع تقدم المهام والعوائق والمواد وجدول الورشة لهذا الموقع.',
            'predicted_delay_action': 'راجع تاريخ النهاية المتوقع وعدّل الخطة أو إجراءات التنفيذ.',
            'no_progress_velocity_action': 'أضف تقدم المهام أو تحديث تقدم حتى يستطيع النظام توقع الإنهاء.',
            'task_weights_missing_action': 'أضف أوزان المهام لتحسين حساب التقدم التلقائي.',
            'openTracking': 'فتح متابعة المشروع',
            'openMonitoring': 'فتح مراقبة الذكاء الاصطناعي',
            'progressConfidence': 'موثوقية التقدم',
            'progressSignals': 'مؤشرات التقدم',
            'weighted_tasks': 'مهام موزونة',
            'manual_update': 'تحديث يدوي',
            'openAlerts': 'تنبيهات مفتوحة',
            'openAlertsDescription': 'يتم إنشاؤها تلقائياً من التأخير والعوائق والبيانات الناقصة.',
            'noOpenAlerts': 'لا توجد تنبيهات مفتوحة.',
            'resolveAlert': 'إغلاق التنبيه',
            'monitoringHistory': 'سجل المراقبة',
            'monitoringHistoryDescription': 'تقارير مراقبة الذكاء الاصطناعي المحفوظة لهذا الطلب.',
            'noMonitoringHistory': 'لا توجد تقارير مراقبة محفوظة بعد.',
            'saving': 'جار الحفظ...',
      },
      'actions': {
            'saving': 'جار الحفظ...',
            'addUpdate': 'إضافة التحديث',
            'uploading': 'جار الرفع...',
            'uploadPhotos': 'رفع الصور',
            'complete': 'إنهاء',
            'delete': 'حذف',
            'resolve': 'حل المشكلة',
            'delivered': 'تم التسليم',
            'addTask': 'إضافة مهمة',
            'saveTask': 'حفظ المهمة',
            'addIssue': 'إضافة مشكلة',
            'addMaterial': 'إضافة مادة'
      }
},
    sitesPage: {
      heading: 'المواقع',
      description: 'عرض مستقل وعمليات إضافة وتعديل وحذف وعرض. كما تظهر المواقع داخل كل طلب.',
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
      missingKey: 'المعامل التعريفي مفقود',
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
      detailedPdf: 'ملف بي دي إف تفصيلي',
      fixedPdf: 'ملف بي دي إف ثابت',
      detailedWord: 'ملف وورد تفصيلي',
      fixedWord: 'ملف وورد ثابت',
    },
    timesheetPage: {
      heading: 'الجداول الشهرية',
      description: 'عرض شهري لكل موظف مع تصدير بي دي إف وورد.',
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
      deleteIntake: '\u062d\u0630\u0641 \u0627\u0644\u0627\u0633\u062a\u0642\u0628\u0627\u0644',
      deleteIntakeConfirm: '\u0647\u0644 \u062a\u0631\u064a\u062f \u062d\u0630\u0641 \u062d\u0627\u0644\u0629 \u0627\u0644\u0627\u0633\u062a\u0642\u0628\u0627\u0644 \u0628\u0627\u0644\u0643\u0627\u0645\u0644\u061f \u0633\u062a\u064f\u062d\u0630\u0641 \u0631\u0633\u0627\u0626\u0644\u0647\u0627 \u0648\u0628\u064a\u0627\u0646\u0627\u062a\u0647\u0627\u060c \u0648\u0633\u062a\u0628\u0642\u0649 \u0627\u0644\u0637\u0644\u0628\u0627\u062a \u0648\u0627\u0644\u0639\u0645\u0644\u0627\u0621 \u0627\u0644\u0630\u064a\u0646 \u0623\u064f\u0646\u0634\u0626\u0648\u0627 \u0633\u0627\u0628\u0642\u064b\u0627.',
      conversation: 'المحادثة',
      conversationDesc: 'المتطلبات المسجلة بدعم الذكاء الاصطناعي',
      generateProposal: 'إنشاء العرض',
      exportProposalPdf: '\u0625\u0646\u0634\u0627\u0621 \u0645\u0644\u0641 \u0628\u064a \u062f\u064a \u0625\u0641',
      saveDraft: 'حفظ المسودة',
      clearConversation: 'مسح الرسائل',
      clearConversationConfirm: 'هل تريد مسح هذه المحادثة؟ سيتم حذف الرسائل المحفوظة لهذا الإدخال.',
      deleteMessage: '\u062d\u0630\u0641 \u0627\u0644\u0631\u0633\u0627\u0644\u0629',
      deleteMessageConfirm: '\u0647\u0644 \u062a\u0631\u064a\u062f \u062d\u0630\u0641 \u0647\u0630\u0647 \u0627\u0644\u0631\u0633\u0627\u0644\u0629\u061f \u0633\u062a\u064f\u0639\u0627\u062f \u0645\u0639\u0627\u0644\u062c\u0629 \u0645\u0639\u0644\u0648\u0645\u0627\u062a \u0627\u0644\u0627\u0633\u062a\u0642\u0628\u0627\u0644 \u0627\u0639\u062a\u0645\u0627\u062f\u064b\u0627 \u0639\u0644\u0649 \u0627\u0644\u0631\u0633\u0627\u0626\u0644 \u0627\u0644\u0645\u062a\u0628\u0642\u064a\u0629.',
      deletingMessage: '\u062c\u0627\u0631\u064d \u0627\u0644\u062d\u0630\u0641...',
      clearAllFields: '\u0645\u0633\u062d \u0643\u0644 \u0627\u0644\u062d\u0642\u0648\u0644',
      clearAllFieldsConfirm: '\u0647\u0644 \u062a\u0631\u064a\u062f \u0645\u0633\u062d \u0643\u0644 \u0627\u0644\u062d\u0642\u0648\u0644 \u0644\u0647\u0630\u0627 \u0627\u0644\u0625\u062f\u062e\u0627\u0644\u061f \u0633\u062a\u0628\u0642\u0649 \u0627\u0644\u0631\u0633\u0627\u0626\u0644 \u0648\u0633\u062c\u0644 \u0627\u0644\u0625\u062f\u062e\u0627\u0644 \u0645\u062d\u0641\u0648\u0638\u064a\u0646.',
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
      notMentioned: 'غير مذكور',
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
      responseFailed: 'فشل رد المساعد الذكي.',
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
    authPage: {
      pageTitle: 'تسجيل الدخول أو إنشاء حساب',
      loginTab: 'تسجيل الدخول',
      signupTab: 'إنشاء حساب',
      loginTitle: 'مرحبًا بعودتك',
      signupTitle: 'إنشاء حساب جديد',
      userButtonLabel: 'الحساب',
      email: 'البريد الإلكتروني',
      emailPlaceholder: 'name@example.com',
      phone: 'الهاتف',
      phonePlaceholder: '+966 5X XXX XXXX',
      password: 'كلمة المرور',
      passwordPlaceholder: '8 أحرف على الأقل، رقم ورمز',
      confirmPassword: 'تأكيد كلمة المرور',
      confirmPasswordPlaceholder: 'أعد كلمة المرور',
      submitLogin: 'تسجيل الدخول',
      submitSignup: 'إنشاء حساب',
      helperText: 'بالمتابعة أنت توافق على الشروط.',
      validation: {
        emailRequired: 'البريد الإلكتروني مطلوب.',
        emailInvalid: 'عنوان بريد إلكتروني غير صالح.',
        passwordRequired: 'كلمة المرور مطلوبة.',
        passwordStrength: 'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل وتحتوي على رقم ورمز خاص.',
        phoneRequired: 'رقم الهاتف مطلوب.',
        phoneInvalid: 'رقم هاتف غير صالح.',
        confirmRequired: 'يرجى تأكيد كلمة المرور.',
        passwordsMatch: 'كلمتا المرور غير متطابقتين.',
        successSignup: 'تم إنشاء الحساب بنجاح.',
        successLogin: 'تم تسجيل الدخول بنجاح.',
      },
    },
  },
};


