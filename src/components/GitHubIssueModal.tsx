import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/useAppStore';
import { GitHubIssueCategory, GitHubIssuePayload } from '../types';
import { Bug, Sparkles, HelpCircle, X, Send, Key, FileText, Cpu, ExternalLink, Loader2 } from 'lucide-react';

interface GitHubIssueModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCategory?: GitHubIssueCategory;
  initialTitle?: string;
  initialDescription?: string;
}

export function GitHubIssueModal({
  isOpen,
  onClose,
  initialCategory = 'bug',
  initialTitle = '',
  initialDescription = '',
}: GitHubIssueModalProps) {
  const { t } = useTranslation();
  const createGitHubIssue = useAppStore((s) => s.createGitHubIssue);
  const addToast = useAppStore((s) => s.addToast);

  const [title, setTitle] = useState(initialTitle);
  const [category, setCategory] = useState<GitHubIssueCategory>(initialCategory);
  const [description, setDescription] = useState(initialDescription);
  const [includeLogs, setIncludeLogs] = useState(true);
  const [includeSystemInfo, setIncludeSystemInfo] = useState(true);
  const [githubToken, setGithubToken] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTitle(initialTitle);
      setCategory(initialCategory);
      setDescription(initialDescription);
      setIncludeLogs(true);
      setIncludeSystemInfo(true);
      setGithubToken('');
      setErrorMessage(null);
      setIsSubmitting(false);
    }
  }, [isOpen, initialTitle, initialCategory, initialDescription]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    const payload: GitHubIssuePayload = {
      title: title.trim(),
      category,
      description: description.trim(),
      includeLogs,
      includeSystemInfo,
      githubToken: githubToken.trim() || undefined,
    };

    try {
      const res = await createGitHubIssue(payload);
      if (res.success) {
        const isApi = res.method === 'api';
        addToast({
          type: 'success',
          title: isApi ? 'Обращение отправлено через API' : 'Форма открыта в браузере',
          message: isApi
            ? 'GitHub Issue успешно создано в репозитории.'
            : 'Подготовленный черновик открыт на странице GitHub Issues.',
        });
        onClose();
      } else {
        setErrorMessage(res.error || 'Не удалось отправить обращение на GitHub.');
      }
    } catch (err) {
      const msg = typeof err === 'string' ? err : (err as Error)?.message || String(err);
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="github-issue-modal-title"
    >
      <div className="w-full max-w-xl rounded-[6px] border border-border bg-surface p-6 shadow-2xl animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[6px] bg-brand/10 text-brand border border-brand/20">
              <Send className="h-5 w-5" />
            </div>
            <div>
              <h3 id="github-issue-modal-title" className="text-base font-semibold text-text-primary">
                {t('github_modal.title', 'Отправить обращение на GitHub')}
              </h3>
              <p className="text-xs text-text-muted">
                {t('github_modal.subtitle', 'Сообщить об ошибке или предложить новую функцию')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-[6px] p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-primary transition-colors"
            aria-label="Закрыть"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {errorMessage && (
            <div className="rounded-[6px] border border-status-danger/30 bg-status-dangerSubtle p-3 text-xs text-status-danger">
              {errorMessage}
            </div>
          )}

          {/* Category selection */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-secondary">
              {t('github_modal.category_label', 'Категория обращения')}
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setCategory('bug')}
                className={`flex items-center justify-center gap-2 rounded-[6px] border px-3 py-2 text-xs font-medium transition-all ${
                  category === 'bug'
                    ? 'border-status-danger bg-status-dangerSubtle text-status-danger'
                    : 'border-border bg-surface-subtle text-text-muted hover:border-border-hover hover:text-text-primary'
                }`}
              >
                <Bug className="h-4 w-4" />
                <span>{t('github_modal.category_bug', 'Ошибка')}</span>
              </button>

              <button
                type="button"
                onClick={() => setCategory('enhancement')}
                className={`flex items-center justify-center gap-2 rounded-[6px] border px-3 py-2 text-xs font-medium transition-all ${
                  category === 'enhancement'
                    ? 'border-brand bg-brand/10 text-brand'
                    : 'border-border bg-surface-subtle text-text-muted hover:border-border-hover hover:text-text-primary'
                }`}
              >
                <Sparkles className="h-4 w-4" />
                <span>{t('github_modal.category_feature', 'Идея')}</span>
              </button>

              <button
                type="button"
                onClick={() => setCategory('question')}
                className={`flex items-center justify-center gap-2 rounded-[6px] border px-3 py-2 text-xs font-medium transition-all ${
                  category === 'question'
                    ? 'border-status-warning bg-status-warningSubtle text-status-warning'
                    : 'border-border bg-surface-subtle text-text-muted hover:border-border-hover hover:text-text-primary'
                }`}
              >
                <HelpCircle className="h-4 w-4" />
                <span>{t('github_modal.category_question', 'Вопрос')}</span>
              </button>
            </div>
          </div>

          {/* Issue Title */}
          <div>
            <label htmlFor="issue-title" className="mb-1.5 block text-xs font-medium text-text-secondary">
              {t('github_modal.title_label', 'Заголовок')} <span className="text-status-danger">*</span>
            </label>
            <input
              id="issue-title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('github_modal.title_placeholder', 'Краткое описание проблемы или идеи...')}
              className="w-full rounded-[6px] border border-border bg-surface-subtle px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
            />
          </div>

          {/* Issue Description */}
          <div>
            <label htmlFor="issue-description" className="mb-1.5 block text-xs font-medium text-text-secondary">
              {t('github_modal.description_label', 'Подробное описание')} <span className="text-status-danger">*</span>
            </label>
            <textarea
              id="issue-description"
              required
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t(
                'github_modal.description_placeholder',
                'Опишите шаги для воспроизведения, ожидания и результат...'
              )}
              className="w-full rounded-[6px] border border-border bg-surface-subtle px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none font-mono"
            />
          </div>

          {/* Checkboxes: System Info & Logs */}
          <div className="space-y-2 rounded-[6px] border border-border-subtle bg-surface-subtle/50 p-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeSystemInfo}
                onChange={(e) => setIncludeSystemInfo(e.target.checked)}
                className="h-4 w-4 rounded-[4px] border-border bg-surface text-brand focus:ring-brand"
              />
              <Cpu className="h-3.5 w-3.5 text-text-muted" />
              <span className="text-xs text-text-primary">
                {t('github_modal.include_sysinfo', 'Прикрепить информацию о системе (ОС, версия, права)')}
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeLogs}
                onChange={(e) => setIncludeLogs(e.target.checked)}
                className="h-4 w-4 rounded-[4px] border-border bg-surface text-brand focus:ring-brand"
              />
              <FileText className="h-3.5 w-3.5 text-text-muted" />
              <span className="text-xs text-text-primary">
                {t('github_modal.include_logs', 'Прикрепить последние 50 строк журнала debug.log (обезличенно)')}
              </span>
            </label>
          </div>

          {/* Optional GitHub PAT Token */}
          <div className="space-y-1">
            <label htmlFor="github-token" className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
              <Key className="h-3.5 w-3.5 text-text-muted" />
              <span>{t('github_modal.token_label', 'GitHub Personal Access Token (необязательно)')}</span>
            </label>
            <input
              id="github-token"
              type="password"
              value={githubToken}
              onChange={(e) => setGithubToken(e.target.value)}
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              className="w-full rounded-[6px] border border-border bg-surface-subtle px-3 py-2 font-mono text-xs text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
            />
            <p className="text-[11px] text-text-muted">
              {t(
                'github_modal.token_hint',
                'При наличии токена создастся прямая задача в GitHub. Без токена откроется подготовленный браузер.'
              )}
            </p>
          </div>

          {/* Footer Actions */}
          <div className="mt-6 flex items-center justify-end gap-3 border-t border-border pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-[6px] border border-border px-4 py-2 text-xs font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
            >
              {t('github_modal.cancel', 'Отмена')}
            </button>
            <button
              type="submit"
              disabled={!title.trim() || !description.trim() || isSubmitting}
              className="flex items-center gap-2 rounded-[6px] bg-brand px-4 py-2 text-xs font-medium text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>{t('github_modal.submitting', 'Отправка...')}</span>
                </>
              ) : (
                <>
                  {githubToken.trim() ? <Send className="h-3.5 w-3.5" /> : <ExternalLink className="h-3.5 w-3.5" />}
                  <span>
                    {githubToken.trim()
                      ? t('github_modal.submit_api', 'Создать Issue (API)')
                      : t('github_modal.submit_browser', 'Открыть в браузере')}
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
