import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { ErrorState, Loading } from './States';

/**
 * Shown when the Spark job has not produced results yet (or is running / failed).
 * Lets the user start the PySpark batch job and polls its status.
 */
export default function ProcessingGate({ status, onDone, onRefresh }) {
  const job = status?.job;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const running = job?.state === 'running' || busy;

  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(async () => {
      try {
        const s = await api.status();
        if (s.data.job.state !== 'running') {
          setBusy(false);
          if (s.data.processed && s.data.job.state === 'succeeded') onDone();
          else onRefresh();
        }
      } catch (e) {
        setError(e);
      }
    }, 2500);
    return () => clearInterval(t);
  }, [running, onDone, onRefresh]);

  const start = async () => {
    setError(null);
    setBusy(true);
    try {
      await api.runJob();
    } catch (e) {
      if (e.code !== 'JOB_RUNNING') {
        setBusy(false);
        setError(e);
      }
    }
  };

  if (error) return <ErrorState error={error} onRetry={() => setError(null)} />;
  if (running) return <Loading label="Apache Spark is cleaning the data and computing analytics… (about a minute)" />;

  return (
    <div className="state">
      <h4>{job?.state === 'failed' ? 'The last Spark job failed' : 'No analytics yet'}</h4>
      <p>
        {job?.state === 'failed'
          ? job.error
          : 'Run the PySpark job once to clean the dataset and precompute the dashboard results.'}
      </p>
      <button className="btn primary" onClick={start}>Run Spark job</button>
    </div>
  );
}
