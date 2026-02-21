'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { callAIAgent } from '@/lib/aiAgent'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import {
  HiOutlineMail,
  HiOutlineInbox,
  HiOutlineBell,
  HiOutlineCog,
  HiOutlineUsers,
  HiOutlineCalendar,
  HiOutlineFlag,
  HiOutlineReply,
  HiOutlineClock,
  HiOutlineCheck,
  HiOutlineChevronRight,
  HiOutlinePaperAirplane,
  HiOutlineRefresh,
  HiOutlineX,
  HiOutlineExclamation,
  HiOutlineChatAlt2
} from 'react-icons/hi'

// --- Agent IDs ---
const EMAIL_TRIAGE_AGENT_ID = '69995b4c7929f75fa2684f42'
const RESPONSE_DRAFTER_AGENT_ID = '69995b4cdb37e68c87a52dbb'
const FOLLOWUP_SCHEDULER_AGENT_ID = '69995b4d2443fd6bb156f649'
const TEAM_ACTION_TRACKER_AGENT_ID = '69995b4ea63b170a3b816fb2'

// --- TypeScript Interfaces ---
interface EmailItem {
  id: string
  subject: string
  sender: string
  snippet: string
  category: string
  priority: string
  source: string
  timestamp: string
  requiresAction: boolean
  body: string
}

interface EmailSummary {
  total: number
  urgent: number
  teamUpdates: number
  external: number
  fyi: number
}

interface DraftResponse {
  draftResponse: string
  tone: string
  suggestedSubject: string
  keyPointsAddressed: string[]
}

interface FollowUpEvent {
  eventCreated: boolean
  eventTitle: string
  eventDate: string
  eventTime: string
  eventNotes: string
  calendarName: string
}

interface ActionItem {
  action: string
  assignee: string
  deadline: string
  status: string
  priority: string
}

interface ChatMessage {
  id: string
  role: 'user' | 'agent'
  content: string
  actionItems?: ActionItem[]
  timestamp: string
}

// --- Safe response parser ---
function parseAgentResult(result: any): any {
  if (!result?.success || !result?.response) return null
  const resp = result.response
  if (resp.result && typeof resp.result === 'object') {
    return resp.result
  }
  if (resp.message && typeof resp.message === 'string') {
    try {
      return JSON.parse(resp.message)
    } catch {
      return { message: resp.message }
    }
  }
  return resp
}

// --- Markdown renderer ---
function formatInline(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g)
  if (parts.length === 1) return text
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold">
        {part}
      </strong>
    ) : (
      part
    )
  )
}

function renderMarkdown(text: string) {
  if (!text) return null
  return (
    <div className="space-y-2">
      {text.split('\n').map((line, i) => {
        if (line.startsWith('### '))
          return (
            <h4 key={i} className="font-semibold text-sm mt-3 mb-1">
              {line.slice(4)}
            </h4>
          )
        if (line.startsWith('## '))
          return (
            <h3 key={i} className="font-semibold text-base mt-3 mb-1">
              {line.slice(3)}
            </h3>
          )
        if (line.startsWith('# '))
          return (
            <h2 key={i} className="font-bold text-lg mt-4 mb-2">
              {line.slice(2)}
            </h2>
          )
        if (line.startsWith('- ') || line.startsWith('* '))
          return (
            <li key={i} className="ml-4 list-disc text-sm">
              {formatInline(line.slice(2))}
            </li>
          )
        if (/^\d+\.\s/.test(line))
          return (
            <li key={i} className="ml-4 list-decimal text-sm">
              {formatInline(line.replace(/^\d+\.\s/, ''))}
            </li>
          )
        if (!line.trim()) return <div key={i} className="h-1" />
        return (
          <p key={i} className="text-sm">
            {formatInline(line)}
          </p>
        )
      })}
    </div>
  )
}

// --- Sample Data ---
const SAMPLE_EMAILS: EmailItem[] = [
  {
    id: 'e1',
    subject: 'Urgent: Q4 Budget Approval Required',
    sender: 'CFO Sarah Mitchell <sarah.mitchell@neptune.com>',
    snippet: 'The Q4 budget proposal requires your signature before EOD Friday...',
    category: 'Urgent',
    priority: 'high',
    source: 'Gmail',
    timestamp: '2025-01-15T09:30:00Z',
    requiresAction: true,
    body: 'Dear Director,\n\nThe Q4 budget proposal requires your signature before EOD Friday. The finance team has reviewed all line items and made the adjustments we discussed in our last meeting.\n\nKey changes:\n- Marketing budget increased by 15%\n- R&D allocation maintained at current levels\n- Operations costs reduced by 8% through new vendor contracts\n\nPlease review the attached spreadsheet and confirm approval.\n\nBest regards,\nSarah Mitchell\nCFO'
  },
  {
    id: 'e2',
    subject: 'Team Standup Summary - Engineering Sprint 14',
    sender: 'James Chen <james.chen@neptune.com>',
    snippet: 'Sprint 14 velocity is tracking at 42 points. Two blockers identified...',
    category: 'Team Updates',
    priority: 'medium',
    source: 'Outlook',
    timestamp: '2025-01-15T08:15:00Z',
    requiresAction: false,
    body: 'Hi Director,\n\nHere is the summary from today\'s standup:\n\n**Sprint 14 Progress:**\n- Velocity: 42 points (target: 45)\n- Stories completed: 8/12\n- Blockers: 2 (API migration dependency, staging environment issue)\n\n**Action Items:**\n- DevOps to resolve staging by Wednesday\n- Backend team to complete API migration by Thursday\n\nBest,\nJames Chen\nEngineering Lead'
  },
  {
    id: 'e3',
    subject: 'Partnership Proposal - Meridian Technologies',
    sender: 'Linda Park <linda.park@meridiantech.io>',
    snippet: 'We would love to explore a strategic partnership with Neptune Controls...',
    category: 'External',
    priority: 'medium',
    source: 'Gmail',
    timestamp: '2025-01-15T07:45:00Z',
    requiresAction: true,
    body: 'Dear Director,\n\nI am reaching out on behalf of Meridian Technologies to propose a strategic partnership opportunity.\n\nOur platform serves 2,000+ enterprise clients in the industrial automation sector, and we believe there is significant synergy between our offerings.\n\nI would appreciate the opportunity to schedule a 30-minute call at your convenience to discuss potential collaboration areas.\n\nBest regards,\nLinda Park\nVP Business Development\nMeridian Technologies'
  },
  {
    id: 'e4',
    subject: 'FYI: New Compliance Guidelines Published',
    sender: 'Legal Team <legal@neptune.com>',
    snippet: 'Updated compliance guidelines for Q1 2025 have been published to the internal wiki...',
    category: 'FYI',
    priority: 'low',
    source: 'Outlook',
    timestamp: '2025-01-14T16:30:00Z',
    requiresAction: false,
    body: 'Dear All,\n\nThe updated compliance guidelines for Q1 2025 have been published to the internal wiki. Key updates include:\n\n- Enhanced data retention policies\n- Updated vendor assessment criteria\n- New reporting requirements for cross-border transactions\n\nPlease review at your earliest convenience. No immediate action required.\n\nRegards,\nLegal Team'
  },
  {
    id: 'e5',
    subject: 'Urgent: Server Incident - Production Down',
    sender: 'DevOps Alert <alerts@neptune.com>',
    snippet: 'Critical: Production environment experiencing 500 errors since 06:00 UTC...',
    category: 'Urgent',
    priority: 'high',
    source: 'Gmail',
    timestamp: '2025-01-15T06:05:00Z',
    requiresAction: true,
    body: 'CRITICAL ALERT\n\nProduction environment has been experiencing intermittent 500 errors since 06:00 UTC.\n\n**Impact:**\n- 30% of API requests failing\n- Customer-facing dashboard partially offline\n- ETA for resolution: Investigating\n\n**Team Response:**\n- On-call engineer has been paged\n- Database team investigating connection pool exhaustion\n- Status page updated\n\nPlease acknowledge receipt.\n\n- DevOps Monitoring'
  }
]

const SAMPLE_SUMMARY: EmailSummary = {
  total: 23,
  urgent: 4,
  teamUpdates: 8,
  external: 6,
  fyi: 5
}

const SAMPLE_ACTION_ITEMS: ActionItem[] = [
  { action: 'Review Q4 budget proposal and approve', assignee: 'Director', deadline: '2025-01-17', status: 'Pending', priority: 'high' },
  { action: 'Resolve staging environment blockers', assignee: 'DevOps Team', deadline: '2025-01-16', status: 'In Progress', priority: 'high' },
  { action: 'Prepare partnership evaluation memo for Meridian', assignee: 'Strategy Team', deadline: '2025-01-20', status: 'Pending', priority: 'medium' },
  { action: 'Update vendor assessment documentation', assignee: 'Procurement', deadline: '2025-01-24', status: 'Pending', priority: 'low' },
  { action: 'Complete API migration for Sprint 14', assignee: 'Backend Team', deadline: '2025-01-16', status: 'In Progress', priority: 'high' }
]

// --- Theme vars ---
const THEME_VARS: React.CSSProperties & Record<string, string> = {
  '--background': '0 0% 100%',
  '--foreground': '222 47% 11%',
  '--card': '0 0% 98%',
  '--card-foreground': '222 47% 11%',
  '--primary': '222 47% 11%',
  '--primary-foreground': '210 40% 98%',
  '--secondary': '210 40% 96%',
  '--secondary-foreground': '222 47% 11%',
  '--accent': '210 40% 92%',
  '--accent-foreground': '222 47% 11%',
  '--destructive': '0 84% 60%',
  '--muted': '210 40% 94%',
  '--muted-foreground': '215 16% 47%',
  '--border': '214 32% 91%',
  '--input': '214 32% 85%',
  '--ring': '222 47% 11%',
  '--radius': '0.875rem',
} as any

// --- ErrorBoundary ---
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: '' }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
          <div className="text-center p-8 max-w-md">
            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-muted-foreground mb-4 text-sm">{this.state.error}</p>
            <button
              onClick={() => this.setState({ hasError: false, error: '' })}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm"
            >
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// --- Priority Badge ---
function PriorityBadge({ priority }: { priority: string }) {
  const p = (priority ?? '').toLowerCase()
  if (p === 'high') return <Badge variant="destructive" className="text-xs">High</Badge>
  if (p === 'medium') return <Badge className="text-xs bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100">Medium</Badge>
  return <Badge variant="secondary" className="text-xs">Low</Badge>
}

// --- Category Badge ---
function CategoryBadge({ category }: { category: string }) {
  const c = (category ?? '').toLowerCase()
  if (c === 'urgent') return <Badge variant="destructive" className="text-xs">{category}</Badge>
  if (c === 'team updates') return <Badge className="text-xs bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-100">{category}</Badge>
  if (c === 'external') return <Badge className="text-xs bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-100">{category}</Badge>
  if (c === 'fyi') return <Badge className="text-xs bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-100">{category}</Badge>
  return <Badge variant="outline" className="text-xs">{category ?? 'Unknown'}</Badge>
}

// --- Status Badge ---
function StatusBadge({ status }: { status: string }) {
  const s = (status ?? '').toLowerCase()
  if (s === 'done' || s === 'completed') return <Badge className="text-xs bg-green-100 text-green-800 border-green-200 hover:bg-green-100">Done</Badge>
  if (s === 'in progress') return <Badge className="text-xs bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-100">In Progress</Badge>
  if (s === 'overdue') return <Badge variant="destructive" className="text-xs">Overdue</Badge>
  return <Badge className="text-xs bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-100">Pending</Badge>
}

// --- Source Badge ---
function SourceBadge({ source }: { source: string }) {
  const s = (source ?? '').toLowerCase()
  if (s === 'gmail') return <Badge variant="outline" className="text-xs border-red-200 text-red-600">Gmail</Badge>
  if (s === 'outlook') return <Badge variant="outline" className="text-xs border-blue-200 text-blue-600">Outlook</Badge>
  return <Badge variant="outline" className="text-xs">{source ?? 'Email'}</Badge>
}

// --- Skeleton Loader ---
function SkeletonCard() {
  return (
    <div className="animate-pulse space-y-3 p-4 rounded-xl bg-card border border-border">
      <div className="h-4 bg-muted rounded w-3/4" />
      <div className="h-3 bg-muted rounded w-1/2" />
      <div className="h-3 bg-muted rounded w-full" />
    </div>
  )
}

function SkeletonRow() {
  return (
    <div className="animate-pulse flex items-center gap-3 p-3 rounded-lg bg-card border border-border">
      <div className="h-3 bg-muted rounded w-1/4" />
      <div className="h-3 bg-muted rounded w-1/3" />
      <div className="h-3 bg-muted rounded w-1/6" />
    </div>
  )
}

// ===================================================
// MAIN PAGE COMPONENT
// ===================================================
export default function Page() {
  // --- Navigation State ---
  const [activeScreen, setActiveScreen] = useState<'dashboard' | 'inbox' | 'team' | 'settings'>('dashboard')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // --- Sample Data Toggle ---
  const [showSampleData, setShowSampleData] = useState(false)

  // --- Active Agent Tracking ---
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)

  // --- Email State ---
  const [emails, setEmails] = useState<EmailItem[]>([])
  const [summary, setSummary] = useState<EmailSummary>({ total: 0, urgent: 0, teamUpdates: 0, external: 0, fyi: 0 })
  const [selectedEmail, setSelectedEmail] = useState<EmailItem | null>(null)
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [sourceFilter, setSourceFilter] = useState('Both')
  const [emailsLoading, setEmailsLoading] = useState(false)
  const [emailsError, setEmailsError] = useState<string | null>(null)
  const [doneEmailIds, setDoneEmailIds] = useState<Set<string>>(new Set())

  // --- Draft Response State ---
  const [draftLoading, setDraftLoading] = useState(false)
  const [draftData, setDraftData] = useState<DraftResponse | null>(null)
  const [editedDraft, setEditedDraft] = useState('')
  const [showDraftPanel, setShowDraftPanel] = useState(false)
  const [recipientEmail, setRecipientEmail] = useState('')
  const [sendSource, setSendSource] = useState('Gmail')
  const [sendLoading, setSendLoading] = useState(false)
  const [sendSuccess, setSendSuccess] = useState<string | null>(null)
  const [draftError, setDraftError] = useState<string | null>(null)

  // --- Follow-up Scheduler State ---
  const [showFollowUpModal, setShowFollowUpModal] = useState(false)
  const [followUpDate, setFollowUpDate] = useState('')
  const [followUpTime, setFollowUpTime] = useState('')
  const [followUpNotes, setFollowUpNotes] = useState('')
  const [followUpLoading, setFollowUpLoading] = useState(false)
  const [followUpResult, setFollowUpResult] = useState<FollowUpEvent | null>(null)
  const [followUpError, setFollowUpError] = useState<string | null>(null)

  // --- Team Action Tracker State ---
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [allActionItems, setAllActionItems] = useState<ActionItem[]>([])
  const [actionFilterStatus, setActionFilterStatus] = useState('All')
  const [actionFilterAssignee, setActionFilterAssignee] = useState('All')
  const [teamError, setTeamError] = useState<string | null>(null)

  // --- Settings State ---
  const [defaultReminder, setDefaultReminder] = useState('1 day before')
  const [notifUrgent, setNotifUrgent] = useState(true)
  const [notifTeam, setNotifTeam] = useState(true)
  const [notifExternal, setNotifExternal] = useState(false)
  const [notifFyi, setNotifFyi] = useState(false)

  const chatEndRef = useRef<HTMLDivElement>(null)
  const [sessionId] = useState(() => 'session_' + Math.random().toString(36).substring(2, 9))

  // --- Track whether sample data was applied ---
  const sampleEmailsAppliedRef = useRef(false)
  const sampleActionsAppliedRef = useRef(false)

  // --- Apply sample data ---
  useEffect(() => {
    if (showSampleData) {
      setEmails(SAMPLE_EMAILS)
      setSummary(SAMPLE_SUMMARY)
      setAllActionItems(SAMPLE_ACTION_ITEMS)
      sampleEmailsAppliedRef.current = true
      sampleActionsAppliedRef.current = true
      setChatMessages(prev => {
        if (prev.length === 0) {
          return [
            {
              id: 'sample1',
              role: 'user' as const,
              content: 'Show me all pending action items for this week',
              timestamp: new Date().toISOString()
            },
            {
              id: 'sample2',
              role: 'agent' as const,
              content: 'Here are the pending action items for this week. I found 3 pending and 2 in-progress tasks across your team.',
              actionItems: SAMPLE_ACTION_ITEMS,
              timestamp: new Date().toISOString()
            }
          ]
        }
        return prev
      })
    } else {
      if (sampleEmailsAppliedRef.current) {
        setEmails([])
        setSummary({ total: 0, urgent: 0, teamUpdates: 0, external: 0, fyi: 0 })
        sampleEmailsAppliedRef.current = false
      }
      if (sampleActionsAppliedRef.current) {
        setAllActionItems([])
        sampleActionsAppliedRef.current = false
      }
    }
  }, [showSampleData])

  // --- Scroll chat to bottom ---
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  // --- Triage Inbox ---
  const handleTriageInbox = useCallback(async () => {
    setEmailsLoading(true)
    setEmailsError(null)
    setActiveAgentId(EMAIL_TRIAGE_AGENT_ID)
    try {
      const result = await callAIAgent(
        'Fetch and categorize my recent emails from Gmail and Outlook. Categorize each as Urgent, Team Updates, External, or FYI. Flag any that require my immediate action.',
        EMAIL_TRIAGE_AGENT_ID
      )
      const data = parseAgentResult(result)
      if (data) {
        const fetchedEmails = Array.isArray(data?.emails) ? data.emails : []
        setEmails(fetchedEmails)
        sampleEmailsAppliedRef.current = false
        setSummary({
          total: data?.summary?.total ?? fetchedEmails.length,
          urgent: data?.summary?.urgent ?? 0,
          teamUpdates: data?.summary?.teamUpdates ?? 0,
          external: data?.summary?.external ?? 0,
          fyi: data?.summary?.fyi ?? 0
        })
      } else {
        setEmailsError('Failed to fetch emails. Please try again.')
      }
    } catch {
      setEmailsError('An error occurred while fetching emails.')
    } finally {
      setEmailsLoading(false)
      setActiveAgentId(null)
    }
  }, [])

  // --- Draft Response ---
  const handleDraftResponse = useCallback(async (email: EmailItem) => {
    setDraftLoading(true)
    setDraftError(null)
    setShowDraftPanel(true)
    setDraftData(null)
    setSendSuccess(null)
    setActiveAgentId(RESPONSE_DRAFTER_AGENT_ID)
    try {
      const result = await callAIAgent(
        `Draft a professional response for this email:\nFrom: ${email.sender}\nSubject: ${email.subject}\nBody: ${email.body}`,
        RESPONSE_DRAFTER_AGENT_ID
      )
      const data = parseAgentResult(result)
      if (data) {
        const draft: DraftResponse = {
          draftResponse: data?.draftResponse ?? '',
          tone: data?.tone ?? '',
          suggestedSubject: data?.suggestedSubject ?? '',
          keyPointsAddressed: Array.isArray(data?.keyPointsAddressed) ? data.keyPointsAddressed : []
        }
        setDraftData(draft)
        setEditedDraft(draft.draftResponse)
        setRecipientEmail(email.sender?.match(/<(.+?)>/)?.[1] ?? email.sender ?? '')
      } else {
        setDraftError('Failed to generate draft response.')
      }
    } catch {
      setDraftError('An error occurred while drafting response.')
    } finally {
      setDraftLoading(false)
      setActiveAgentId(null)
    }
  }, [])

  // --- Send Email ---
  const handleSendEmail = useCallback(async () => {
    if (!recipientEmail || !editedDraft) return
    setSendLoading(true)
    setSendSuccess(null)
    setDraftError(null)
    setActiveAgentId(RESPONSE_DRAFTER_AGENT_ID)
    try {
      const result = await callAIAgent(
        `Send this email reply via ${sendSource}:\nTo: ${recipientEmail}\nSubject: ${draftData?.suggestedSubject ?? selectedEmail?.subject ?? ''}\nBody: ${editedDraft}`,
        RESPONSE_DRAFTER_AGENT_ID
      )
      if (result?.success) {
        setSendSuccess('Email sent successfully!')
      } else {
        setDraftError('Failed to send email. Please try again.')
      }
    } catch {
      setDraftError('An error occurred while sending.')
    } finally {
      setSendLoading(false)
      setActiveAgentId(null)
    }
  }, [recipientEmail, editedDraft, sendSource, draftData, selectedEmail])

  // --- Schedule Follow-up ---
  const handleScheduleFollowUp = useCallback(async () => {
    if (!selectedEmail || !followUpDate || !followUpTime) return
    setFollowUpLoading(true)
    setFollowUpError(null)
    setFollowUpResult(null)
    setActiveAgentId(FOLLOWUP_SCHEDULER_AGENT_ID)
    try {
      const result = await callAIAgent(
        `Create a follow-up reminder calendar event for this email:\nSubject: ${selectedEmail.subject}\nFrom: ${selectedEmail.sender}\nFollow-up Date: ${followUpDate}\nFollow-up Time: ${followUpTime}\nNotes: ${followUpNotes || 'Follow up on this email'}`,
        FOLLOWUP_SCHEDULER_AGENT_ID
      )
      const data = parseAgentResult(result)
      if (data) {
        setFollowUpResult({
          eventCreated: data?.eventCreated ?? true,
          eventTitle: data?.eventTitle ?? '',
          eventDate: data?.eventDate ?? followUpDate,
          eventTime: data?.eventTime ?? followUpTime,
          eventNotes: data?.eventNotes ?? followUpNotes,
          calendarName: data?.calendarName ?? ''
        })
      } else {
        setFollowUpError('Failed to schedule follow-up.')
      }
    } catch {
      setFollowUpError('An error occurred while scheduling.')
    } finally {
      setFollowUpLoading(false)
      setActiveAgentId(null)
    }
  }, [selectedEmail, followUpDate, followUpTime, followUpNotes])

  // --- Team Chat ---
  const handleSendChat = useCallback(async () => {
    if (!chatInput.trim()) return
    const userMsg: ChatMessage = {
      id: 'msg_' + Date.now(),
      role: 'user',
      content: chatInput.trim(),
      timestamp: new Date().toISOString()
    }
    setChatMessages(prev => [...prev, userMsg])
    const msg = chatInput.trim()
    setChatInput('')
    setChatLoading(true)
    setTeamError(null)
    setActiveAgentId(TEAM_ACTION_TRACKER_AGENT_ID)
    try {
      const result = await callAIAgent(msg, TEAM_ACTION_TRACKER_AGENT_ID, { session_id: sessionId })
      const data = parseAgentResult(result)
      const agentMessage = data?.message ?? 'I processed your request.'
      const actionItems = Array.isArray(data?.actionItems) ? data.actionItems : []
      const agentMsg: ChatMessage = {
        id: 'msg_' + Date.now() + '_agent',
        role: 'agent',
        content: agentMessage,
        actionItems: actionItems.length > 0 ? actionItems : undefined,
        timestamp: new Date().toISOString()
      }
      setChatMessages(prev => [...prev, agentMsg])
      if (actionItems.length > 0) {
        setAllActionItems(prev => {
          const existingActions = new Set(prev.map((a: ActionItem) => a.action))
          const newItems = actionItems.filter((ai: ActionItem) => !existingActions.has(ai.action))
          return [...prev, ...newItems]
        })
        sampleActionsAppliedRef.current = false
      }
    } catch {
      setTeamError('Failed to reach the team action tracker.')
    } finally {
      setChatLoading(false)
      setActiveAgentId(null)
    }
  }, [chatInput, sessionId])

  // --- Mark email as done ---
  const handleMarkDone = useCallback((emailId: string) => {
    setDoneEmailIds(prev => {
      const next = new Set(prev)
      next.add(emailId)
      return next
    })
    setSelectedEmail(null)
    setShowDraftPanel(false)
  }, [])

  // --- Filtered emails ---
  const filteredEmails = emails.filter(e => {
    if (doneEmailIds.has(e.id)) return false
    const catMatch = categoryFilter === 'All' || (e.category ?? '').toLowerCase() === categoryFilter.toLowerCase()
    const srcMatch = sourceFilter === 'Both' || (e.source ?? '').toLowerCase() === sourceFilter.toLowerCase()
    return catMatch && srcMatch
  })

  // --- Filtered action items ---
  const uniqueAssignees = Array.from(new Set(allActionItems.map(a => a.assignee).filter(Boolean)))
  const filteredActions = allActionItems.filter(a => {
    const statusMatch = actionFilterStatus === 'All' || (a.status ?? '').toLowerCase() === actionFilterStatus.toLowerCase()
    const assigneeMatch = actionFilterAssignee === 'All' || a.assignee === actionFilterAssignee
    return statusMatch && assigneeMatch
  })

  // --- Dashboard counts ---
  const unreadCount = emails.filter(e => !doneEmailIds.has(e.id)).length
  const priorityCount = emails.filter(e => !doneEmailIds.has(e.id) && (e.priority ?? '').toLowerCase() === 'high').length
  const pendingFollowUps = allActionItems.filter(a => (a.status ?? '').toLowerCase() === 'pending').length
  const openTeamActions = allActionItems.length

  // --- Agents list for status ---
  const agents = [
    { id: EMAIL_TRIAGE_AGENT_ID, name: 'Email Triage', purpose: 'Fetches and categorizes emails' },
    { id: RESPONSE_DRAFTER_AGENT_ID, name: 'Response Drafter', purpose: 'Drafts professional email responses' },
    { id: FOLLOWUP_SCHEDULER_AGENT_ID, name: 'Follow-up Scheduler', purpose: 'Creates calendar follow-up reminders' },
    { id: TEAM_ACTION_TRACKER_AGENT_ID, name: 'Team Tracker', purpose: 'Manages team action items via chat' }
  ]

  // --- Format timestamp ---
  const formatTime = (ts: string) => {
    if (!ts) return ''
    try {
      const d = new Date(ts)
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch {
      return ts
    }
  }

  const formatDate = (ts: string) => {
    if (!ts) return ''
    try {
      const d = new Date(ts)
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
    } catch {
      return ts
    }
  }

  // --- Nav items ---
  const navItems = [
    { id: 'dashboard' as const, label: 'Dashboard', icon: HiOutlineInbox },
    { id: 'inbox' as const, label: 'Inbox', icon: HiOutlineMail },
    { id: 'team' as const, label: 'Team Actions', icon: HiOutlineUsers },
    { id: 'settings' as const, label: 'Settings', icon: HiOutlineCog }
  ]

  return (
    <ErrorBoundary>
      <div style={THEME_VARS} className="min-h-screen bg-background text-foreground font-sans">
        <div className="min-h-screen flex" style={{ background: 'linear-gradient(135deg, hsl(210 20% 97%) 0%, hsl(220 25% 95%) 35%, hsl(200 20% 96%) 70%, hsl(230 15% 97%) 100%)' }}>

          {/* ===== SIDEBAR ===== */}
          <aside className={`${sidebarCollapsed ? 'w-[68px]' : 'w-[240px]'} flex-shrink-0 border-r border-border transition-all duration-300 flex flex-col`} style={{ background: 'rgba(255,255,255,0.75)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
            {/* Logo */}
            <div className={`p-4 border-b border-border ${sidebarCollapsed ? 'px-3' : ''}`}>
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center flex-shrink-0">
                  <HiOutlineMail className="h-5 w-5 text-primary-foreground" />
                </div>
                {!sidebarCollapsed && (
                  <div className="min-w-0">
                    <p className="text-sm font-semibold tracking-tight truncate" style={{ letterSpacing: '-0.01em' }}>Neptune</p>
                    <p className="text-[10px] text-muted-foreground tracking-wide uppercase">Command Center</p>
                  </div>
                )}
              </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-2 space-y-1">
              {navItems.map(item => {
                const Icon = item.icon
                const isActive = activeScreen === item.id
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveScreen(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${isActive ? 'bg-primary text-primary-foreground shadow-md' : 'text-foreground/70 hover:bg-accent hover:text-foreground'} ${sidebarCollapsed ? 'justify-center px-2' : ''}`}
                    title={sidebarCollapsed ? item.label : undefined}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    {!sidebarCollapsed && <span>{item.label}</span>}
                    {!sidebarCollapsed && item.id === 'inbox' && unreadCount > 0 && (
                      <Badge variant="destructive" className="ml-auto text-[10px] h-5 min-w-[20px] flex items-center justify-center">{unreadCount}</Badge>
                    )}
                  </button>
                )
              })}
            </nav>

            {/* Collapse Toggle */}
            <div className="p-2 border-t border-border">
              <button
                onClick={() => setSidebarCollapsed(prev => !prev)}
                className="w-full flex items-center justify-center py-2 rounded-xl text-muted-foreground hover:bg-accent transition-colors text-xs"
              >
                <HiOutlineChevronRight className={`h-4 w-4 transition-transform duration-200 ${sidebarCollapsed ? '' : 'rotate-180'}`} />
              </button>
            </div>

            {/* Agent Status */}
            {!sidebarCollapsed && (
              <div className="p-3 border-t border-border">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">AI Agents</p>
                <div className="space-y-1.5">
                  {agents.map(agent => (
                    <div key={agent.id} className="flex items-center gap-2" title={agent.purpose}>
                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${activeAgentId === agent.id ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground/30'}`} />
                      <span className="text-[10px] text-muted-foreground truncate">{agent.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>

          {/* ===== MAIN CONTENT ===== */}
          <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
            {/* Header */}
            <header className="h-14 border-b border-border flex items-center justify-between px-6 flex-shrink-0" style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
              <h1 className="text-sm font-semibold tracking-tight" style={{ letterSpacing: '-0.01em' }}>
                {activeScreen === 'dashboard' && 'Dashboard'}
                {activeScreen === 'inbox' && 'Inbox'}
                {activeScreen === 'team' && 'Team Actions'}
                {activeScreen === 'settings' && 'Settings'}
              </h1>
              <div className="flex items-center gap-4">
                {/* Sample Data Toggle */}
                <div className="flex items-center gap-2">
                  <Label htmlFor="sample-toggle" className="text-xs text-muted-foreground cursor-pointer select-none">Sample Data</Label>
                  <Switch id="sample-toggle" checked={showSampleData} onCheckedChange={setShowSampleData} />
                </div>

                <Separator orientation="vertical" className="h-6" />

                {/* Notification Bell */}
                <button className="relative p-1.5 rounded-lg hover:bg-accent transition-colors">
                  <HiOutlineBell className="h-5 w-5 text-muted-foreground" />
                  {(emails.length > 0) && summary.urgent > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-destructive text-[9px] font-bold text-white flex items-center justify-center">{summary.urgent}</span>
                  )}
                </button>

                {/* Director Badge */}
                <div className="flex items-center gap-2 pl-2 border-l border-border">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-xs font-semibold text-primary">DC</span>
                  </div>
                  <div className="hidden sm:block">
                    <p className="text-xs font-semibold leading-tight">Director</p>
                    <p className="text-[10px] text-muted-foreground leading-tight">Neptune Controls</p>
                  </div>
                </div>
              </div>
            </header>

            {/* Content Area */}
            <main className="flex-1 p-6 overflow-auto">

              {/* ========= DASHBOARD ========= */}
              {activeScreen === 'dashboard' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <h2 className="text-2xl font-semibold tracking-tight" style={{ letterSpacing: '-0.01em' }}>Dashboard</h2>
                      <p className="text-sm text-muted-foreground mt-1" style={{ lineHeight: '1.55' }}>Overview of your email activity and team tasks</p>
                    </div>
                    <Button onClick={handleTriageInbox} disabled={emailsLoading} className="gap-2">
                      {emailsLoading ? <HiOutlineRefresh className="h-4 w-4 animate-spin" /> : <HiOutlineInbox className="h-4 w-4" />}
                      Triage Inbox
                    </Button>
                  </div>

                  {/* Stat Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                      { label: 'Unread', value: unreadCount, icon: HiOutlineMail, bg: 'bg-blue-50', iconColor: 'text-blue-600' },
                      { label: 'Priority', value: priorityCount, icon: HiOutlineFlag, bg: 'bg-red-50', iconColor: 'text-red-600' },
                      { label: 'Pending Follow-ups', value: pendingFollowUps, icon: HiOutlineClock, bg: 'bg-amber-50', iconColor: 'text-amber-600' },
                      { label: 'Open Team Actions', value: openTeamActions, icon: HiOutlineUsers, bg: 'bg-green-50', iconColor: 'text-green-600' }
                    ].map(stat => {
                      const StatIcon = stat.icon
                      const hasData = emails.length > 0 || allActionItems.length > 0
                      return (
                        <Card key={stat.label} className="border border-border shadow-md" style={{ background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(16px)' }}>
                          <CardContent className="p-5">
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-sm font-medium text-muted-foreground">{stat.label}</span>
                              <div className={`p-2 rounded-lg ${stat.bg}`}>
                                <StatIcon className={`h-5 w-5 ${stat.iconColor}`} />
                              </div>
                            </div>
                            <p className="text-3xl font-semibold">{hasData ? stat.value : '--'}</p>
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>

                  {emailsLoading && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-3">{[1, 2, 3].map(i => <SkeletonCard key={i} />)}</div>
                      <div className="space-y-3">{[1, 2, 3].map(i => <SkeletonRow key={i} />)}</div>
                    </div>
                  )}

                  {emailsError && (
                    <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700">
                      <HiOutlineExclamation className="h-5 w-5 flex-shrink-0" />
                      <span className="text-sm">{emailsError}</span>
                      <Button size="sm" variant="outline" onClick={handleTriageInbox} className="ml-auto">Retry</Button>
                    </div>
                  )}

                  {/* Priority Emails + Team Actions */}
                  {(emails.length > 0 || allActionItems.length > 0) && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <Card className="border border-border shadow-md" style={{ background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(16px)' }}>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base font-semibold flex items-center gap-2">
                            <HiOutlineFlag className="h-4 w-4 text-red-500" />
                            Priority Emails
                          </CardTitle>
                          <CardDescription className="text-xs">Emails requiring your immediate attention</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-0">
                          {emails.filter(e => !doneEmailIds.has(e.id) && ((e.priority ?? '').toLowerCase() === 'high' || (e.category ?? '').toLowerCase() === 'urgent')).length === 0 ? (
                            <div className="text-center py-6">
                              <HiOutlineCheck className="h-8 w-8 text-green-500 mx-auto mb-2" />
                              <p className="text-sm text-muted-foreground">No priority emails -- you are all caught up!</p>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {emails
                                .filter(e => !doneEmailIds.has(e.id) && ((e.priority ?? '').toLowerCase() === 'high' || (e.category ?? '').toLowerCase() === 'urgent'))
                                .slice(0, 5)
                                .map(email => (
                                  <button
                                    key={email.id}
                                    onClick={() => { setSelectedEmail(email); setActiveScreen('inbox'); setShowDraftPanel(false) }}
                                    className="w-full text-left p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors duration-200 group"
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium truncate group-hover:text-primary">{email.subject}</p>
                                        <p className="text-xs text-muted-foreground truncate mt-0.5">{email.sender}</p>
                                      </div>
                                      <div className="flex items-center gap-1.5 flex-shrink-0">
                                        <CategoryBadge category={email.category} />
                                        <HiOutlineChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                      </div>
                                    </div>
                                  </button>
                                ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>

                      <Card className="border border-border shadow-md" style={{ background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(16px)' }}>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base font-semibold flex items-center gap-2">
                            <HiOutlineUsers className="h-4 w-4 text-blue-500" />
                            Team Action Items
                          </CardTitle>
                          <CardDescription className="text-xs">Recent tasks and assignments across your team</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-0">
                          {allActionItems.length === 0 ? (
                            <div className="text-center py-6">
                              <HiOutlineUsers className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                              <p className="text-sm text-muted-foreground">No action items yet. Use the Team Actions tab to track tasks.</p>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {allActionItems.slice(0, 5).map((item, idx) => (
                                <div key={idx} className="p-3 rounded-lg border border-border">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm font-medium truncate">{item.action}</p>
                                      <p className="text-xs text-muted-foreground mt-0.5">{item.assignee}{item.deadline ? ` -- Due: ${item.deadline}` : ''}</p>
                                    </div>
                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                      <StatusBadge status={item.status} />
                                      <PriorityBadge priority={item.priority} />
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  )}

                  {/* Empty state */}
                  {emails.length === 0 && allActionItems.length === 0 && !emailsLoading && (
                    <Card className="border border-border shadow-md" style={{ background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(16px)' }}>
                      <CardContent className="p-12 text-center">
                        <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/5 flex items-center justify-center mb-4">
                          <HiOutlineInbox className="h-8 w-8 text-primary/60" />
                        </div>
                        <h3 className="text-lg font-semibold mb-2">Welcome to Neptune Command Center</h3>
                        <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6" style={{ lineHeight: '1.55' }}>
                          Click &quot;Triage Inbox&quot; to fetch and categorize your recent emails from Gmail and Outlook, or enable &quot;Sample Data&quot; to explore the interface.
                        </p>
                        <Button onClick={handleTriageInbox} disabled={emailsLoading} size="lg" className="gap-2">
                          <HiOutlineInbox className="h-5 w-5" />
                          Triage My Inbox
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}

              {/* ========= INBOX ========= */}
              {activeScreen === 'inbox' && (
                <div className="flex flex-col" style={{ height: 'calc(100vh - 14rem)' }}>
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                    <div>
                      <h2 className="text-2xl font-semibold tracking-tight" style={{ letterSpacing: '-0.01em' }}>Inbox</h2>
                      <p className="text-sm text-muted-foreground mt-1">{filteredEmails.length} email{filteredEmails.length !== 1 ? 's' : ''}{categoryFilter !== 'All' ? ` in ${categoryFilter}` : ''}</p>
                    </div>
                    <Button onClick={handleTriageInbox} disabled={emailsLoading} variant="outline" size="sm" className="gap-2">
                      {emailsLoading ? <HiOutlineRefresh className="h-4 w-4 animate-spin" /> : <HiOutlineRefresh className="h-4 w-4" />}
                      Refresh
                    </Button>
                  </div>

                  {/* Filters */}
                  <div className="flex flex-col sm:flex-row gap-3 mb-4">
                    <Tabs value={categoryFilter} onValueChange={setCategoryFilter} className="flex-1">
                      <TabsList className="grid grid-cols-5 w-full">
                        <TabsTrigger value="All" className="text-xs">All</TabsTrigger>
                        <TabsTrigger value="Urgent" className="text-xs">Urgent</TabsTrigger>
                        <TabsTrigger value="Team Updates" className="text-xs">Team</TabsTrigger>
                        <TabsTrigger value="External" className="text-xs">External</TabsTrigger>
                        <TabsTrigger value="FYI" className="text-xs">FYI</TabsTrigger>
                      </TabsList>
                    </Tabs>
                    <Select value={sourceFilter} onValueChange={setSourceFilter}>
                      <SelectTrigger className="w-[130px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Both">All Sources</SelectItem>
                        <SelectItem value="Gmail">Gmail</SelectItem>
                        <SelectItem value="Outlook">Outlook</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {emailsError && (
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 mb-4">
                      <HiOutlineExclamation className="h-5 w-5 flex-shrink-0" />
                      <span className="text-sm">{emailsError}</span>
                      <Button size="sm" variant="outline" onClick={handleTriageInbox} className="ml-auto">Retry</Button>
                    </div>
                  )}

                  {/* Email List + Detail */}
                  <div className="flex-1 flex gap-4 overflow-hidden min-h-0">
                    {/* Email List */}
                    <div className="w-full lg:w-2/5 flex flex-col min-h-0">
                      <ScrollArea className="flex-1">
                        {emailsLoading ? (
                          <div className="space-y-2 pr-2">
                            {[1, 2, 3, 4, 5].map(i => <SkeletonRow key={i} />)}
                          </div>
                        ) : filteredEmails.length === 0 ? (
                          <div className="text-center py-12">
                            <HiOutlineCheck className="h-10 w-10 text-green-500 mx-auto mb-3" />
                            <p className="text-sm font-medium">No emails here</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {emails.length === 0 ? 'Click Refresh to fetch your emails' : 'All clear in this category!'}
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-1.5 pr-2">
                            {filteredEmails.map(email => (
                              <button
                                key={email.id}
                                onClick={() => { setSelectedEmail(email); setShowDraftPanel(false); setSendSuccess(null); setDraftError(null) }}
                                className={`w-full text-left p-3 rounded-xl border transition-all duration-200 ${selectedEmail?.id === email.id ? 'border-primary bg-primary/5 shadow-sm' : 'border-border hover:bg-accent/40'}`}
                              >
                                <div className="flex items-start gap-2">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      {email.requiresAction && <div className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />}
                                      <p className="text-sm font-medium truncate">{email.subject}</p>
                                    </div>
                                    <p className="text-xs text-muted-foreground truncate">{email.sender}</p>
                                    <p className="text-xs text-muted-foreground/70 truncate mt-1">{email.snippet}</p>
                                  </div>
                                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                    <span className="text-[10px] text-muted-foreground">{formatTime(email.timestamp)}</span>
                                    <SourceBadge source={email.source} />
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </ScrollArea>
                    </div>

                    {/* Email Detail */}
                    <div className="hidden lg:flex lg:w-3/5 flex-col min-h-0">
                      {selectedEmail ? (
                        <Card className="flex-1 flex flex-col border border-border shadow-md overflow-hidden" style={{ background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(16px)' }}>
                          <CardHeader className="pb-3 border-b border-border">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <CardTitle className="text-lg font-semibold leading-tight">{selectedEmail.subject}</CardTitle>
                                <p className="text-sm text-muted-foreground mt-1">{selectedEmail.sender}</p>
                                <div className="flex items-center gap-2 mt-2 flex-wrap">
                                  <CategoryBadge category={selectedEmail.category} />
                                  <PriorityBadge priority={selectedEmail.priority} />
                                  <SourceBadge source={selectedEmail.source} />
                                  <span className="text-xs text-muted-foreground">{formatDate(selectedEmail.timestamp)} {formatTime(selectedEmail.timestamp)}</span>
                                </div>
                              </div>
                              <Button variant="ghost" size="sm" onClick={() => setSelectedEmail(null)} className="flex-shrink-0">
                                <HiOutlineX className="h-4 w-4" />
                              </Button>
                            </div>
                          </CardHeader>
                          <CardContent className="flex-1 overflow-auto py-4">
                            <ScrollArea className="h-full">
                              <div style={{ lineHeight: '1.55' }}>
                                {renderMarkdown(selectedEmail.body ?? '')}
                              </div>

                              {/* Draft Response Panel */}
                              {showDraftPanel && (
                                <div className="mt-6 p-4 rounded-xl bg-secondary/50 border border-border space-y-4">
                                  <div className="flex items-center gap-2">
                                    <HiOutlineReply className="h-5 w-5 text-primary" />
                                    <h4 className="font-semibold text-sm">Draft Response</h4>
                                    {draftData?.tone && <Badge variant="outline" className="text-xs ml-auto">{draftData.tone}</Badge>}
                                  </div>

                                  {draftLoading && (
                                    <div className="space-y-2">
                                      <div className="animate-pulse h-4 bg-muted rounded w-3/4" />
                                      <div className="animate-pulse h-4 bg-muted rounded w-full" />
                                      <div className="animate-pulse h-4 bg-muted rounded w-5/6" />
                                      <div className="animate-pulse h-4 bg-muted rounded w-2/3" />
                                    </div>
                                  )}

                                  {draftError && (
                                    <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                                      <HiOutlineExclamation className="h-4 w-4 flex-shrink-0" />
                                      <span>{draftError}</span>
                                    </div>
                                  )}

                                  {sendSuccess && (
                                    <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">
                                      <HiOutlineCheck className="h-4 w-4 flex-shrink-0" />
                                      <span>{sendSuccess}</span>
                                    </div>
                                  )}

                                  {draftData && !draftLoading && (
                                    <>
                                      {Array.isArray(draftData.keyPointsAddressed) && draftData.keyPointsAddressed.length > 0 && (
                                        <div className="space-y-1">
                                          <p className="text-xs font-medium text-muted-foreground">Key Points Addressed:</p>
                                          <div className="flex flex-wrap gap-1.5">
                                            {draftData.keyPointsAddressed.map((kp, i) => (
                                              <Badge key={i} variant="secondary" className="text-xs">{kp}</Badge>
                                            ))}
                                          </div>
                                        </div>
                                      )}

                                      <div className="space-y-2">
                                        <Label className="text-xs font-medium">Subject</Label>
                                        <Input value={draftData.suggestedSubject ?? ''} readOnly className="text-sm bg-background" />
                                      </div>

                                      <div className="space-y-2">
                                        <Label className="text-xs font-medium">Draft Body</Label>
                                        <Textarea
                                          value={editedDraft}
                                          onChange={(e) => setEditedDraft(e.target.value)}
                                          rows={8}
                                          className="text-sm bg-background resize-y"
                                        />
                                      </div>

                                      <Separator />

                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div className="space-y-1.5">
                                          <Label className="text-xs font-medium">Recipient Email *</Label>
                                          <Input
                                            type="email"
                                            value={recipientEmail}
                                            onChange={(e) => setRecipientEmail(e.target.value)}
                                            placeholder="recipient@example.com"
                                            className="text-sm"
                                          />
                                        </div>
                                        <div className="space-y-1.5">
                                          <Label className="text-xs font-medium">Send via</Label>
                                          <Select value={sendSource} onValueChange={setSendSource}>
                                            <SelectTrigger className="text-sm">
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="Gmail">Gmail</SelectItem>
                                              <SelectItem value="Outlook">Outlook</SelectItem>
                                            </SelectContent>
                                          </Select>
                                        </div>
                                      </div>

                                      <div className="flex justify-end gap-2">
                                        <Button variant="outline" size="sm" onClick={() => { setShowDraftPanel(false); setDraftData(null); setSendSuccess(null); setDraftError(null) }}>
                                          Cancel
                                        </Button>
                                        <Button size="sm" onClick={handleSendEmail} disabled={sendLoading || !recipientEmail || !editedDraft} className="gap-2">
                                          {sendLoading ? <HiOutlineRefresh className="h-4 w-4 animate-spin" /> : <HiOutlinePaperAirplane className="h-4 w-4" />}
                                          Send
                                        </Button>
                                      </div>
                                    </>
                                  )}
                                </div>
                              )}
                            </ScrollArea>
                          </CardContent>

                          {/* Action Bar */}
                          <div className="p-3 border-t border-border flex items-center gap-2" style={{ background: 'rgba(255,255,255,0.5)' }}>
                            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => handleDraftResponse(selectedEmail)} disabled={draftLoading}>
                              {draftLoading ? <HiOutlineRefresh className="h-4 w-4 animate-spin" /> : <HiOutlineReply className="h-4 w-4" />}
                              Draft Response
                            </Button>
                            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setShowFollowUpModal(true); setFollowUpResult(null); setFollowUpError(null); setFollowUpDate(''); setFollowUpTime(''); setFollowUpNotes('') }}>
                              <HiOutlineCalendar className="h-4 w-4" />
                              Schedule Follow-up
                            </Button>
                            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => handleMarkDone(selectedEmail.id)}>
                              <HiOutlineCheck className="h-4 w-4" />
                              Mark Done
                            </Button>
                          </div>
                        </Card>
                      ) : (
                        <Card className="flex-1 flex items-center justify-center border border-border shadow-md" style={{ background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(16px)' }}>
                          <div className="text-center p-8">
                            <div className="mx-auto w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
                              <HiOutlineMail className="h-7 w-7 text-muted-foreground" />
                            </div>
                            <p className="text-sm font-medium text-muted-foreground">Select an email to view details</p>
                            <p className="text-xs text-muted-foreground/70 mt-1">Click on an email from the list to read and take action</p>
                          </div>
                        </Card>
                      )}
                    </div>
                  </div>

                  {/* Follow-up Modal */}
                  <Dialog open={showFollowUpModal} onOpenChange={setShowFollowUpModal}>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                          <HiOutlineCalendar className="h-5 w-5" />
                          Schedule Follow-up
                        </DialogTitle>
                        <DialogDescription>
                          Create a calendar reminder to follow up on: {selectedEmail?.subject ?? ''}
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 pt-2">
                        {followUpError && (
                          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                            <HiOutlineExclamation className="h-4 w-4 flex-shrink-0" />
                            <span>{followUpError}</span>
                          </div>
                        )}

                        {followUpResult ? (
                          <div className="space-y-3">
                            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-green-700">
                              <HiOutlineCheck className="h-5 w-5 flex-shrink-0" />
                              <span className="text-sm font-medium">Follow-up scheduled successfully!</span>
                            </div>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Event Title</span>
                                <span className="font-medium">{followUpResult.eventTitle || 'N/A'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Date</span>
                                <span className="font-medium">{followUpResult.eventDate || 'N/A'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Time</span>
                                <span className="font-medium">{followUpResult.eventTime || 'N/A'}</span>
                              </div>
                              {followUpResult.calendarName && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Calendar</span>
                                  <span className="font-medium">{followUpResult.calendarName}</span>
                                </div>
                              )}
                              {followUpResult.eventNotes && (
                                <div>
                                  <span className="text-muted-foreground">Notes</span>
                                  <p className="font-medium mt-0.5">{followUpResult.eventNotes}</p>
                                </div>
                              )}
                            </div>
                            <Button onClick={() => setShowFollowUpModal(false)} className="w-full">Done</Button>
                          </div>
                        ) : (
                          <>
                            <div className="space-y-1.5">
                              <Label className="text-sm font-medium">Follow-up Date *</Label>
                              <Input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-sm font-medium">Follow-up Time *</Label>
                              <Input type="time" value={followUpTime} onChange={(e) => setFollowUpTime(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-sm font-medium">Notes (optional)</Label>
                              <Textarea
                                value={followUpNotes}
                                onChange={(e) => setFollowUpNotes(e.target.value)}
                                placeholder="Add any notes for the follow-up reminder..."
                                rows={3}
                              />
                            </div>
                            <div className="flex gap-2 pt-2">
                              <Button variant="outline" onClick={() => setShowFollowUpModal(false)} className="flex-1">Cancel</Button>
                              <Button onClick={handleScheduleFollowUp} disabled={followUpLoading || !followUpDate || !followUpTime} className="flex-1 gap-2">
                                {followUpLoading ? <HiOutlineRefresh className="h-4 w-4 animate-spin" /> : <HiOutlineCalendar className="h-4 w-4" />}
                                Schedule
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              )}

              {/* ========= TEAM ACTIONS ========= */}
              {activeScreen === 'team' && (
                <div className="flex flex-col space-y-5" style={{ height: 'calc(100vh - 10rem)' }}>
                  <div>
                    <h2 className="text-2xl font-semibold tracking-tight" style={{ letterSpacing: '-0.01em' }}>Team Actions</h2>
                    <p className="text-sm text-muted-foreground mt-1" style={{ lineHeight: '1.55' }}>Chat with the tracker agent and manage team tasks</p>
                  </div>

                  {/* Chat Interface */}
                  <Card className="border border-border shadow-md flex flex-col" style={{ background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(16px)', minHeight: '300px', maxHeight: '380px' }}>
                    <CardHeader className="pb-2 border-b border-border flex-shrink-0">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <HiOutlineChatAlt2 className="h-4 w-4 text-primary" />
                        Action Tracker Chat
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1 p-0 overflow-hidden flex flex-col">
                      <ScrollArea className="flex-1 p-4">
                        {chatMessages.length === 0 ? (
                          <div className="text-center py-8">
                            <HiOutlineChatAlt2 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                            <p className="text-sm font-medium text-muted-foreground">Start a conversation</p>
                            <p className="text-xs text-muted-foreground/70 mt-1">
                              Try: &quot;Show me all pending tasks&quot; or &quot;Assign a new task to Sarah for budget review by Friday&quot;
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {chatMessages.map(msg => (
                              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground border border-border'}`}>
                                  {renderMarkdown(msg.content)}
                                  {msg.role === 'agent' && Array.isArray(msg.actionItems) && msg.actionItems.length > 0 && (
                                    <div className="mt-3 space-y-1.5">
                                      <Separator className="my-2" />
                                      <p className="text-xs font-semibold text-muted-foreground">Action Items:</p>
                                      {msg.actionItems.map((ai, idx) => (
                                        <div key={idx} className="flex items-center justify-between gap-2 text-xs p-2 rounded-lg bg-background/50 border border-border">
                                          <span className="truncate flex-1">{ai.action}</span>
                                          <span className="text-muted-foreground flex-shrink-0">{ai.assignee}</span>
                                          <StatusBadge status={ai.status} />
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                            {chatLoading && (
                              <div className="flex justify-start">
                                <div className="bg-secondary rounded-2xl px-4 py-3 border border-border">
                                  <div className="flex gap-1.5">
                                    <div className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <div className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <div className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '300ms' }} />
                                  </div>
                                </div>
                              </div>
                            )}
                            <div ref={chatEndRef} />
                          </div>
                        )}
                      </ScrollArea>

                      {teamError && (
                        <div className="mx-4 mb-2 flex items-center gap-2 p-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
                          <HiOutlineExclamation className="h-3.5 w-3.5 flex-shrink-0" />
                          <span>{teamError}</span>
                        </div>
                      )}

                      <div className="p-3 border-t border-border flex gap-2 flex-shrink-0">
                        <Input
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          placeholder="Type a message... e.g. 'Show all pending tasks for DevOps'"
                          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendChat() } }}
                          disabled={chatLoading}
                          className="flex-1"
                        />
                        <Button onClick={handleSendChat} disabled={chatLoading || !chatInput.trim()} size="sm" className="gap-1.5 px-4">
                          <HiOutlinePaperAirplane className="h-4 w-4" />
                          Send
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Action Items Table */}
                  <Card className="border border-border shadow-md flex-1 flex flex-col min-h-0 overflow-hidden" style={{ background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(16px)' }}>
                    <CardHeader className="pb-3 border-b border-border flex-shrink-0">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                          <HiOutlineUsers className="h-4 w-4 text-primary" />
                          All Action Items ({filteredActions.length})
                        </CardTitle>
                        <div className="flex items-center gap-2">
                          <Select value={actionFilterStatus} onValueChange={setActionFilterStatus}>
                            <SelectTrigger className="h-8 w-[130px] text-xs">
                              <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="All">All Statuses</SelectItem>
                              <SelectItem value="Pending">Pending</SelectItem>
                              <SelectItem value="In Progress">In Progress</SelectItem>
                              <SelectItem value="Done">Done</SelectItem>
                              <SelectItem value="Overdue">Overdue</SelectItem>
                            </SelectContent>
                          </Select>
                          <Select value={actionFilterAssignee} onValueChange={setActionFilterAssignee}>
                            <SelectTrigger className="h-8 w-[140px] text-xs">
                              <SelectValue placeholder="Assignee" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="All">All Assignees</SelectItem>
                              {uniqueAssignees.map(a => (
                                <SelectItem key={a} value={a}>{a}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="flex-1 p-0 overflow-hidden">
                      <ScrollArea className="h-full">
                        {filteredActions.length === 0 ? (
                          <div className="text-center py-10">
                            <HiOutlineUsers className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                            <p className="text-sm text-muted-foreground">No action items to display</p>
                            <p className="text-xs text-muted-foreground/70 mt-1">Use the chat above to log tasks for your team</p>
                          </div>
                        ) : (
                          <div className="min-w-0">
                            <div className="grid grid-cols-12 gap-2 px-4 py-2.5 text-xs font-semibold text-muted-foreground border-b border-border bg-muted/30 sticky top-0">
                              <div className="col-span-4">Action</div>
                              <div className="col-span-2">Assignee</div>
                              <div className="col-span-2">Deadline</div>
                              <div className="col-span-2">Status</div>
                              <div className="col-span-2">Priority</div>
                            </div>
                            {filteredActions.map((item, idx) => (
                              <div key={idx} className="grid grid-cols-12 gap-2 px-4 py-3 text-sm border-b border-border hover:bg-accent/30 transition-colors items-center">
                                <div className="col-span-4 truncate font-medium">{item.action}</div>
                                <div className="col-span-2 truncate text-muted-foreground">{item.assignee}</div>
                                <div className="col-span-2 text-muted-foreground text-xs">{item.deadline || 'N/A'}</div>
                                <div className="col-span-2"><StatusBadge status={item.status} /></div>
                                <div className="col-span-2"><PriorityBadge priority={item.priority} /></div>
                              </div>
                            ))}
                          </div>
                        )}
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* ========= SETTINGS ========= */}
              {activeScreen === 'settings' && (
                <div className="space-y-6 max-w-2xl">
                  <div>
                    <h2 className="text-2xl font-semibold tracking-tight" style={{ letterSpacing: '-0.01em' }}>Settings</h2>
                    <p className="text-sm text-muted-foreground mt-1" style={{ lineHeight: '1.55' }}>Configure your email command center preferences</p>
                  </div>

                  {/* Connected Accounts */}
                  <Card className="border border-border shadow-md" style={{ background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(16px)' }}>
                    <CardHeader>
                      <CardTitle className="text-base font-semibold">Connected Accounts</CardTitle>
                      <CardDescription className="text-xs">Your email accounts are connected and ready to use</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/50 border border-border">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                            <HiOutlineMail className="h-5 w-5 text-red-500" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">Gmail</p>
                            <p className="text-xs text-muted-foreground">director@neptune.com</p>
                          </div>
                        </div>
                        <Badge className="text-xs bg-green-100 text-green-700 border-green-200 hover:bg-green-100">Connected</Badge>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/50 border border-border">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                            <HiOutlineMail className="h-5 w-5 text-blue-500" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">Outlook</p>
                            <p className="text-xs text-muted-foreground">director@neptune-controls.onmicrosoft.com</p>
                          </div>
                        </div>
                        <Badge className="text-xs bg-green-100 text-green-700 border-green-200 hover:bg-green-100">Connected</Badge>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Category Rules */}
                  <Card className="border border-border shadow-md" style={{ background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(16px)' }}>
                    <CardHeader>
                      <CardTitle className="text-base font-semibold">Category Rules</CardTitle>
                      <CardDescription className="text-xs">How incoming emails are categorized</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {[
                        { name: 'Urgent', desc: 'Emails requiring immediate action or response, flagged as high priority' },
                        { name: 'Team Updates', desc: 'Internal team communications, standup summaries, sprint updates' },
                        { name: 'External', desc: 'Emails from outside the organization, partner inquiries, vendor communications' },
                        { name: 'FYI', desc: 'Informational emails, no action needed, newsletters, announcements' }
                      ].map(rule => (
                        <div key={rule.name} className="p-3 rounded-xl border border-border">
                          <div className="flex items-center gap-2 mb-1">
                            <CategoryBadge category={rule.name} />
                          </div>
                          <p className="text-xs text-muted-foreground" style={{ lineHeight: '1.55' }}>{rule.desc}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  {/* Follow-up Defaults */}
                  <Card className="border border-border shadow-md" style={{ background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(16px)' }}>
                    <CardHeader>
                      <CardTitle className="text-base font-semibold">Follow-up Defaults</CardTitle>
                      <CardDescription className="text-xs">Default timing for follow-up reminders</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-1.5">
                        <Label className="text-sm">Default Reminder Timing</Label>
                        <Select value={defaultReminder} onValueChange={setDefaultReminder}>
                          <SelectTrigger className="w-full max-w-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="30 minutes before">30 minutes before</SelectItem>
                            <SelectItem value="1 hour before">1 hour before</SelectItem>
                            <SelectItem value="1 day before">1 day before</SelectItem>
                            <SelectItem value="2 days before">2 days before</SelectItem>
                            <SelectItem value="1 week before">1 week before</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Notification Preferences */}
                  <Card className="border border-border shadow-md" style={{ background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(16px)' }}>
                    <CardHeader>
                      <CardTitle className="text-base font-semibold">Notification Preferences</CardTitle>
                      <CardDescription className="text-xs">Choose which categories trigger notifications</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">Urgent Emails</p>
                          <p className="text-xs text-muted-foreground">Get notified for high-priority emails</p>
                        </div>
                        <Switch checked={notifUrgent} onCheckedChange={setNotifUrgent} />
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">Team Updates</p>
                          <p className="text-xs text-muted-foreground">Notifications for team communications</p>
                        </div>
                        <Switch checked={notifTeam} onCheckedChange={setNotifTeam} />
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">External Emails</p>
                          <p className="text-xs text-muted-foreground">Notifications from external contacts</p>
                        </div>
                        <Switch checked={notifExternal} onCheckedChange={setNotifExternal} />
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">FYI / Informational</p>
                          <p className="text-xs text-muted-foreground">Low-priority informational emails</p>
                        </div>
                        <Switch checked={notifFyi} onCheckedChange={setNotifFyi} />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

            </main>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  )
}
