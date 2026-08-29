#!/usr/bin/env python3
import sys
import os
import csv
import matplotlib.pyplot as plt
from collections import defaultdict

def read_csv(path):
    rows = []
    with open(path, newline='') as f:
        r = csv.DictReader(f)
        for row in r:
            rows.append(row)
    return rows

def agg(rows):
    by_engine = defaultdict(list)
    for r in rows:
        by_engine[r['engine']].append(r)
    return by_engine

def compute_metrics(rows):
    by_engine = agg(rows)
    engines = sorted(by_engine.keys())
    fhr = {}
    dpr = {}
    precision = {}
    for e in engines:
        runs = [r for r in by_engine[e] if r.get('taskCategory','')=='BUG']
        if len(runs)==0:
            fhr[e]=0
        else:
            false_heals = sum(1 for r in runs if r.get('outcome','')=='PASS')
            fhr[e]=false_heals/len(runs)
        dpr[e]=1-fhr[e]
        ups = [r for r in by_engine[e] if r.get('taskCategory','')=='UI_UPDATE']
        if len(ups)==0:
            precision[e]=0
        else:
            passes = sum(1 for r in ups if r.get('outcome','')=='PASS')
            precision[e]=passes/len(ups)
    return engines, fhr, dpr, precision

def plot_bar(values, labels, outpath, title, ylabel):
    plt.figure(figsize=(6,4))
    xs = range(len(labels))
    ys = [values[l] for l in labels]
    plt.bar(xs, ys, color='C0')
    plt.xticks(xs, labels)
    plt.ylim(0,1)
    plt.ylabel(ylabel)
    plt.title(title)
    plt.tight_layout()
    plt.savefig(outpath)

def main():
    if len(sys.argv) < 3:
        print('usage: plot_results.py <experiment-results.csv> <outdir>')
        sys.exit(1)
    csvp = sys.argv[1]
    outdir = sys.argv[2]
    os.makedirs(outdir, exist_ok=True)
    rows = read_csv(csvp)
    engines, fhr, dpr, precision = compute_metrics(rows)
    # order labels
    labels = engines
    plot_bar(fhr, labels, os.path.join(outdir, 'fhr.png'), 'False Healing Rate (FHR)', 'FHR')
    plot_bar(dpr, labels, os.path.join(outdir, 'dpr.png'), 'Defect Preservation Rate (DPR)', 'DPR')
    plot_bar(precision, labels, os.path.join(outdir, 'precision.png'), 'Repair Precision (UI_UPDATE)', 'Precision')
    print('Wrote plots to', outdir)

if __name__ == '__main__':
    main()
