import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  DollarSign,
  BarChart3,
  AlertTriangle,
  Activity
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from './ui/table';
import { formatNumber, formatPercent } from '../lib/utils';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';
const API = `${API_BASE}/api`;

const FundingArbitrageDashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get(`${API}/funding-arbitrage`);

      if (response.data.success) {
        setData(response.data);
        setLastUpdated(new Date());
      } else {
        setError(response.data.error || 'Failed to fetch data');
      }
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchData();
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [autoRefresh]);

  const getFundingBadgeVariant = (fundingRate) => {
    if (fundingRate > 0.0005) return 'success'; // >0.05%
    if (fundingRate > 0.0001) return 'warning'; // >0.01%
    if (fundingRate < -0.0001) return 'destructive'; // <-0.01%
    return 'secondary';
  };

  const getPriceChangeBadgeVariant = (priceChange) => {
    if (priceChange > 5) return 'success';
    if (priceChange > 0) return 'warning';
    if (priceChange < -5) return 'destructive';
    return 'secondary';
  };

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <div className="flex items-center space-x-2 text-white">
              <RefreshCw className="h-6 w-6 animate-spin" />
              <span className="text-lg">Loading market data...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
        <div className="max-w-7xl mx-auto">
          <Card className="border-red-500/20 bg-red-500/10">
            <CardHeader>
              <CardTitle className="text-red-400 flex items-center">
                <AlertTriangle className="h-5 w-5 mr-2" />
                Error Loading Data
              </CardTitle>
              <CardDescription className="text-red-300">{error}</CardDescription>
            </CardHeader>
            <CardContent>
              <button
                onClick={fetchData}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                Retry
              </button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold text-white">
            Hyperliquid Funding Arbitrage
          </h1>
          <p className="text-xl text-slate-300">
            Real-time funding opportunities for markets with >$50M USD open interest
          </p>

          <div className="flex items-center justify-center space-x-4">
            <button
              onClick={fetchData}
              disabled={loading}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>

            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                autoRefresh
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-gray-600 hover:bg-gray-700 text-white'
              }`}
            >
              <Activity className="h-4 w-4" />
              <span>{autoRefresh ? 'Auto: ON' : 'Auto: OFF'}</span>
            </button>

            {lastUpdated && (
              <span className="text-sm text-slate-400">
                Last updated: {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-medium text-slate-400 flex items-center">
                <BarChart3 className="h-4 w-4 mr-2" />
                Total Markets
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{data?.total_markets || 0}</div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-medium text-slate-400 flex items-center">
                <DollarSign className="h-4 w-4 mr-2" />
                Qualified Markets
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-400">{data?.filtered_markets || 0}</div>
              <p className="text-xs text-slate-400 mt-1">
                >$50M USD open interest
              </p>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-medium text-slate-400 flex items-center">
                <TrendingUp className="h-4 w-4 mr-2" />
                Highest Funding
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-400">
                {data?.highest_funding_rate ? formatPercent(data.highest_funding_rate.funding_rate) : 'N/A'}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {data?.highest_funding_rate?.symbol || 'No data'}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-medium text-slate-400 flex items-center">
                <Activity className="h-4 w-4 mr-2" />
                Market Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-400">LIVE</div>
              <p className="text-xs text-slate-400 mt-1">
                Real-time data
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Markets Table */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">Market Data</CardTitle>
            <CardDescription className="text-slate-400">
              Sorted by funding rate (highest first)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-slate-700/50">
                    <TableHead className="text-slate-300">Symbol</TableHead>
                    <TableHead className="text-slate-300">Mark Price</TableHead>
                    <TableHead className="text-slate-300">Funding Rate</TableHead>
                    <TableHead className="text-slate-300">Open Interest</TableHead>
                    <TableHead className="text-slate-300">24h Volume</TableHead>
                    <TableHead className="text-slate-300">24h Change</TableHead>
                    <TableHead className="text-slate-300">Premium</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.markets?.map((market, index) => (
                    <TableRow
                      key={market.symbol}
                      className={`border-slate-700 hover:bg-slate-700/30 ${
                        index === 0 ? 'bg-green-500/10 border-green-500/20' : ''
                      }`}
                    >
                      <TableCell className="font-medium text-white">
                        <div className="flex items-center space-x-2">
                          <span>{market.symbol}</span>
                          {index === 0 && (
                            <Badge variant="success" className="text-xs">
                              BEST
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-300">
                        ${formatNumber(market.mark_price)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getFundingBadgeVariant(market.funding_rate)}>
                          {formatPercent(market.funding_rate)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-slate-300">
                        ${formatNumber(market.open_interest)}
                      </TableCell>
                      <TableCell className="text-slate-300">
                        ${formatNumber(market.day_volume)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getPriceChangeBadgeVariant(market.price_change_24h)}>
                          {market.price_change_24h > 0 ? '+' : ''}{market.price_change_24h.toFixed(2)}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-slate-300">
                        {formatPercent(market.premium)}
                      </TableCell>
                    </TableRow>
                  )) || (
                    <TableRow className="border-slate-700">
                      <TableCell colSpan={7} className="text-center text-slate-400 py-8">
                        No markets found with >$50M USD open interest
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center text-sm text-slate-400">
          <p>Data sourced from Hyperliquid API • Updates every 30 seconds when auto-refresh is enabled</p>
          <p className="mt-2">Built with ❤️ for funding arbitrage analysis</p>
        </div>
      </div>
    </div>
  );
};

export default FundingArbitrageDashboard;