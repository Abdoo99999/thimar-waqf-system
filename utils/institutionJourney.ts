import { CURRENT_YEAR } from '../constants';
import {
  getEvaluationByInstAndYear,
  getImprovements,
  getInstitutionProgress,
} from '../services/db';
import type { Institution } from '../types';

export const JOURNEY_STEPS = [
  { title: 'بيانات المؤسسة', path: '/institutions', flag: 'dataComplete' },
  { title: 'القوائم المالية', path: '/financial-reports', flag: 'financialsDone' },
  { title: 'الأداء المؤسسي', path: '/evaluation', flag: 'evalFinalized' },
  { title: 'الامتثال والمخاطر', path: '/compliance', flag: 'complianceDone' },
  { title: 'خطة التحسين', path: '/improvements', flag: 'improvementsDone' },
  { title: 'المراجعة والإرسال', path: '/review-submit', flag: 'reviewDone' },
] as const;

export type WorkflowStatus = 'draft' | 'submitted' | 'returned' | 'approved';

export interface InstitutionJourney {
  completed: boolean[];
  completedCount: number;
  completionPercent: number;
  currentIndex: number;
  locked: boolean[];
  workflowStatus: WorkflowStatus;
  adminFeedback: string;
}

export const getInstitutionJourney = (institutionId: string): InstitutionJourney => {
  const progress = getInstitutionProgress(institutionId);
  const evaluation = getEvaluationByInstAndYear(institutionId, CURRENT_YEAR);
  const workflowStatus = (evaluation?.workflow_status || 'draft') as WorkflowStatus;
  const improvementsDone = (!!evaluation && getImprovements(evaluation.id).length > 0) || workflowStatus === 'submitted' || workflowStatus === 'approved';
  const completed = [
    progress.dataComplete,
    progress.financialsDone,
    progress.evalFinalized,
    progress.complianceDone,
    improvementsDone,
    workflowStatus === 'submitted' || workflowStatus === 'approved',
  ];
  const firstIncomplete = completed.findIndex(done => !done);
  const currentIndex = firstIncomplete === -1 ? completed.length - 1 : firstIncomplete;
  const locked = completed.map((_, index) => completed.slice(0, index).some(done => !done));
  const completedCount = completed.filter(Boolean).length;

  return {
    completed,
    completedCount,
    completionPercent: Math.round((completedCount / completed.length) * 100),
    currentIndex,
    locked,
    workflowStatus,
    adminFeedback: evaluation?.admin_feedback || '',
  };
};

export const getInstitutionProgressSummary = (institution: Institution) => {
  const journey = getInstitutionJourney(institution.id);
  const isNotStarted = journey.completedCount === 0 && journey.workflowStatus === 'draft';
  const summaryStatus = journey.workflowStatus === 'draft'
    ? isNotStarted ? 'not-started' : 'in-progress'
    : journey.workflowStatus;
  return { ...journey, summaryStatus };
};

export const WORKFLOW_STATUS_META: Record<WorkflowStatus, {
  label: string;
  shortLabel: string;
  className: string;
}> = {
  draft: {
    label: 'مسودة — لم يُرفع بعد',
    shortLabel: 'مسودة',
    className: 'border-stone-200 bg-stone-100 text-stone-700',
  },
  submitted: {
    label: 'مرفوع — قيد المراجعة لدى الوزارة',
    shortLabel: 'مرفوعة',
    className: 'border-sky-200 bg-sky-50 text-sky-800',
  },
  returned: {
    label: 'مُعاد للتعديل',
    shortLabel: 'مُعادة',
    className: 'border-orange-200 bg-orange-50 text-orange-800',
  },
  approved: {
    label: 'معتمد',
    shortLabel: 'معتمدة',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  },
};

