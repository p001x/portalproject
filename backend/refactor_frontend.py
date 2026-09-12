import os
import glob
import re

# We will modify all TSX files in artifacts/geoportal/src/pages
# to support polling.

POLL_HOOK = """
import { useState, useEffect } from 'react';

export function useGeeJob(endpoint, payload) {
    const [jobId, setJobId] = useState(null);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!jobId) return;
        const interval = setInterval(() => {
            fetch(`/api/jobs/${jobId}`)
                .then(res => res.json())
                .then(data => {
                    if (data.status === 'SUCCESS') {
                        setResult(data.result);
                        setLoading(false);
                        setJobId(null);
                        clearInterval(interval);
                    } else if (data.status === 'FAILURE') {
                        setError(data.error);
                        setLoading(false);
                        setJobId(null);
                        clearInterval(interval);
                    }
                })
                .catch(err => {
                    setError(err.toString());
                    setLoading(false);
                    setJobId(null);
                    clearInterval(interval);
                });
        }, 2000);
        return () => clearInterval(interval);
    }, [jobId]);

    const startJob = async (customPayload) => {
        setLoading(true);
        setError(null);
        setResult(null);
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(customPayload || payload)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Failed to start job');
            setJobId(data.job_id);
        } catch(err) {
            setError(err.toString());
            setLoading(false);
        }
    };

    return { startJob, result, error, loading };
}
"""

with open("../artifacts/geoportal/src/hooks/useGeeJob.js", "w") as f:
    f.write(POLL_HOOK)

print("Created useGeeJob hook.")
