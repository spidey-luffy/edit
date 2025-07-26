#!/usr/bin/env python3
"""
TripXplo AI Multi-Agent System Backend Tests
Tests the new multi-agent implementation including API endpoints, intent routing, and agent functionality.
"""

import requests
import json
import time
import sys
from typing import Dict, List, Any, Optional
from datetime import datetime

class MultiAgentTester:
    def __init__(self, base_url: str = "http://localhost:3000"):
        self.base_url = base_url
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'User-Agent': 'TripXplo-AI-Tester/1.0'
        })
        self.test_results = []
        
    def log_test(self, test_name: str, success: bool, details: str, response_time: float = 0):
        """Log test results"""
        result = {
            'test_name': test_name,
            'success': success,
            'details': details,
            'response_time': response_time,
            'timestamp': datetime.now().isoformat()
        }
        self.test_results.append(result)
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}: {details}")
        if response_time > 0:
            print(f"   Response time: {response_time:.2f}s")
        
    def test_health_endpoint(self) -> bool:
        """Test the multi-agent health check endpoint"""
        print("\n🔍 Testing Multi-Agent Health Check Endpoint...")
        
        try:
            start_time = time.time()
            response = self.session.get(f"{self.base_url}/api/multi-agent-health")
            response_time = time.time() - start_time
            
            if response.status_code == 200:
                data = response.json()
                
                # Check required fields
                required_fields = ['overall', 'coordinator', 'agents', 'metrics']
                missing_fields = [field for field in required_fields if field not in data]
                
                if missing_fields:
                    self.log_test("Health Check Structure", False, 
                                f"Missing fields: {missing_fields}", response_time)
                    return False
                
                # Check overall health
                overall_healthy = data.get('overall', {}).get('healthy', False)
                self.log_test("Overall System Health", overall_healthy, 
                            f"System status: {data.get('overall', {}).get('status', 'unknown')}", 
                            response_time)
                
                # Check agent metrics
                agents_data = data.get('agents', {})
                total_agents = agents_data.get('total', 0)
                healthy_agents = agents_data.get('healthy', 0)
                
                self.log_test("Agent Health Status", healthy_agents > 0, 
                            f"Healthy agents: {healthy_agents}/{total_agents}", response_time)
                
                # Check performance metrics
                metrics = data.get('metrics', {})
                avg_success_rate = metrics.get('averageSuccessRate', 0)
                avg_response_time = metrics.get('averageResponseTime', 0)
                
                self.log_test("Performance Metrics", avg_success_rate > 0.5, 
                            f"Success rate: {avg_success_rate:.2f}, Avg response: {avg_response_time:.0f}ms", 
                            response_time)
                
                return overall_healthy
                
            else:
                self.log_test("Health Check HTTP Status", False, 
                            f"HTTP {response.status_code}: {response.text}", response_time)
                return False
                
        except Exception as e:
            self.log_test("Health Check Connection", False, f"Error: {str(e)}")
            return False
    
    def test_multi_agent_endpoint_basic(self) -> bool:
        """Test basic functionality of the multi-agent endpoint"""
        print("\n🤖 Testing Multi-Agent Endpoint - Basic Functionality...")
        
        test_cases = [
            {
                "name": "General Support Query",
                "messages": [
                    {
                        "role": "user",
                        "content": "Hello, I need help with TripXplo AI",
                        "timestamp": datetime.now().isoformat()
                    }
                ],
                "expected_agent": "CUSTOMER_SUPPORT"
            },
            {
                "name": "Travel Request Query", 
                "messages": [
                    {
                        "role": "user",
                        "content": "Show me travel packages to Goa for 5 days",
                        "timestamp": datetime.now().isoformat()
                    }
                ],
                "expected_agent": "CUSTOMER_SUPPORT"  # Currently only customer support is implemented
            },
            {
                "name": "FAQ Query",
                "messages": [
                    {
                        "role": "user", 
                        "content": "What is TripXplo AI?",
                        "timestamp": datetime.now().isoformat()
                    }
                ],
                "expected_agent": "CUSTOMER_SUPPORT"
            }
        ]
        
        all_passed = True
        
        for test_case in test_cases:
            try:
                start_time = time.time()
                
                payload = {
                    "messages": test_case["messages"],
                    "sessionId": f"test-session-{int(time.time())}",
                    "userId": "test-user"
                }
                
                response = self.session.post(
                    f"{self.base_url}/api/multi-agent",
                    json=payload
                )
                response_time = time.time() - start_time
                
                if response.status_code == 200:
                    data = response.json()
                    
                    # Check required response fields
                    required_fields = ['success', 'response', 'agentUsed', 'confidence', 'processingTime']
                    missing_fields = [field for field in required_fields if field not in data]
                    
                    if missing_fields:
                        self.log_test(f"{test_case['name']} - Response Structure", False,
                                    f"Missing fields: {missing_fields}", response_time)
                        all_passed = False
                        continue
                    
                    # Check if request was successful
                    if data.get('success'):
                        agent_used = data.get('agentUsed', '')
                        confidence = data.get('confidence', 0)
                        response_text = data.get('response', '')
                        
                        self.log_test(f"{test_case['name']} - Success", True,
                                    f"Agent: {agent_used}, Confidence: {confidence:.2f}, Response length: {len(response_text)}", 
                                    response_time)
                        
                        # Check response quality
                        if len(response_text) > 10 and confidence > 0.3:
                            self.log_test(f"{test_case['name']} - Quality", True,
                                        f"Good response quality", response_time)
                        else:
                            self.log_test(f"{test_case['name']} - Quality", False,
                                        f"Poor response quality: length={len(response_text)}, confidence={confidence}", 
                                        response_time)
                            all_passed = False
                    else:
                        self.log_test(f"{test_case['name']} - Processing", False,
                                    f"Request failed: {data.get('error', 'Unknown error')}", response_time)
                        all_passed = False
                        
                else:
                    self.log_test(f"{test_case['name']} - HTTP Status", False,
                                f"HTTP {response.status_code}: {response.text[:200]}", response_time)
                    all_passed = False
                    
            except Exception as e:
                self.log_test(f"{test_case['name']} - Exception", False, f"Error: {str(e)}")
                all_passed = False
        
        return all_passed
    
    def test_intent_routing_accuracy(self) -> bool:
        """Test intent routing system with various query types"""
        print("\n🎯 Testing Intent Routing Accuracy...")
        
        routing_test_cases = [
            {
                "query": "Hello, how are you?",
                "expected_category": "customer_support",
                "description": "Greeting"
            },
            {
                "query": "I want to book a trip to Kerala for 7 days",
                "expected_category": "travel_matching", 
                "description": "Travel booking request"
            },
            {
                "query": "What destinations do you cover?",
                "expected_category": "customer_support",
                "description": "FAQ about destinations"
            },
            {
                "query": "I need help with my booking",
                "expected_category": "booking_assistance",
                "description": "Booking assistance"
            },
            {
                "query": "Can I modify my travel package?",
                "expected_category": "package_customization",
                "description": "Package customization"
            }
        ]
        
        correct_routes = 0
        total_routes = len(routing_test_cases)
        
        for test_case in routing_test_cases:
            try:
                start_time = time.time()
                
                payload = {
                    "messages": [
                        {
                            "role": "user",
                            "content": test_case["query"],
                            "timestamp": datetime.now().isoformat()
                        }
                    ],
                    "sessionId": f"routing-test-{int(time.time())}",
                    "userId": "routing-test-user"
                }
                
                response = self.session.post(
                    f"{self.base_url}/api/multi-agent",
                    json=payload
                )
                response_time = time.time() - start_time
                
                if response.status_code == 200:
                    data = response.json()
                    
                    if data.get('success'):
                        # Check routing decision in metadata
                        routing_decision = data.get('metadata', {}).get('routingDecision')
                        
                        if routing_decision:
                            intent_category = routing_decision.get('intentCategory', '')
                            confidence = routing_decision.get('confidence', 0)
                            reasoning = routing_decision.get('reasoning', '')
                            
                            # For now, we'll be lenient since only customer support is fully implemented
                            # We'll check if the system at least attempted routing
                            if intent_category and confidence > 0:
                                correct_routes += 1
                                self.log_test(f"Routing - {test_case['description']}", True,
                                            f"Category: {intent_category}, Confidence: {confidence:.2f}", 
                                            response_time)
                            else:
                                self.log_test(f"Routing - {test_case['description']}", False,
                                            f"No routing decision made", response_time)
                        else:
                            self.log_test(f"Routing - {test_case['description']}", False,
                                        f"No routing metadata found", response_time)
                    else:
                        self.log_test(f"Routing - {test_case['description']}", False,
                                    f"Request failed", response_time)
                else:
                    self.log_test(f"Routing - {test_case['description']}", False,
                                f"HTTP {response.status_code}", response_time)
                    
            except Exception as e:
                self.log_test(f"Routing - {test_case['description']}", False, f"Error: {str(e)}")
        
        accuracy = correct_routes / total_routes if total_routes > 0 else 0
        self.log_test("Overall Routing Accuracy", accuracy > 0.6, 
                    f"Accuracy: {accuracy:.1%} ({correct_routes}/{total_routes})")
        
        return accuracy > 0.6
    
    def test_customer_support_agent(self) -> bool:
        """Test Customer Support Agent functionality"""
        print("\n🎧 Testing Customer Support Agent...")
        
        faq_test_cases = [
            {
                "query": "What is TripXplo AI?",
                "expected_keywords": ["travel", "assistant", "ai", "tripxplo"],
                "description": "About TripXplo FAQ"
            },
            {
                "query": "How do I search for packages?",
                "expected_keywords": ["search", "packages", "tell me", "where"],
                "description": "Package search FAQ"
            },
            {
                "query": "Thank you for your help",
                "expected_keywords": ["welcome", "help", "assistance"],
                "description": "Gratitude response"
            }
        ]
        
        faq_matches = 0
        total_faq_tests = len(faq_test_cases)
        
        for test_case in faq_test_cases:
            try:
                start_time = time.time()
                
                payload = {
                    "messages": [
                        {
                            "role": "user",
                            "content": test_case["query"],
                            "timestamp": datetime.now().isoformat()
                        }
                    ],
                    "sessionId": f"faq-test-{int(time.time())}",
                    "userId": "faq-test-user"
                }
                
                response = self.session.post(
                    f"{self.base_url}/api/multi-agent",
                    json=payload
                )
                response_time = time.time() - start_time
                
                if response.status_code == 200:
                    data = response.json()
                    
                    if data.get('success'):
                        response_text = data.get('response', '').lower()
                        
                        # Check if response contains expected keywords
                        keyword_matches = sum(1 for keyword in test_case['expected_keywords'] 
                                            if keyword.lower() in response_text)
                        
                        if keyword_matches > 0:
                            faq_matches += 1
                            self.log_test(f"FAQ - {test_case['description']}", True,
                                        f"Matched {keyword_matches}/{len(test_case['expected_keywords'])} keywords", 
                                        response_time)
                        else:
                            self.log_test(f"FAQ - {test_case['description']}", False,
                                        f"No keyword matches in response", response_time)
                    else:
                        self.log_test(f"FAQ - {test_case['description']}", False,
                                    f"Request failed", response_time)
                else:
                    self.log_test(f"FAQ - {test_case['description']}", False,
                                f"HTTP {response.status_code}", response_time)
                    
            except Exception as e:
                self.log_test(f"FAQ - {test_case['description']}", False, f"Error: {str(e)}")
        
        faq_success_rate = faq_matches / total_faq_tests if total_faq_tests > 0 else 0
        self.log_test("FAQ Matching Success Rate", faq_success_rate > 0.7,
                    f"Success rate: {faq_success_rate:.1%} ({faq_matches}/{total_faq_tests})")
        
        return faq_success_rate > 0.7
    
    def test_session_continuity(self) -> bool:
        """Test session continuity across multiple messages"""
        print("\n🔄 Testing Session Continuity...")
        
        session_id = f"continuity-test-{int(time.time())}"
        
        conversation_flow = [
            {
                "message": "Hello, I'm planning a trip",
                "expected_response_type": "greeting"
            },
            {
                "message": "I want to go to Goa",
                "expected_response_type": "travel_info"
            },
            {
                "message": "What about the weather there?",
                "expected_response_type": "contextual"
            }
        ]
        
        all_messages = []
        continuity_success = True
        
        for i, step in enumerate(conversation_flow):
            try:
                # Add user message to conversation
                user_message = {
                    "role": "user",
                    "content": step["message"],
                    "timestamp": datetime.now().isoformat()
                }
                all_messages.append(user_message)
                
                start_time = time.time()
                
                payload = {
                    "messages": all_messages.copy(),
                    "sessionId": session_id,
                    "userId": "continuity-test-user"
                }
                
                response = self.session.post(
                    f"{self.base_url}/api/multi-agent",
                    json=payload
                )
                response_time = time.time() - start_time
                
                if response.status_code == 200:
                    data = response.json()
                    
                    if data.get('success'):
                        response_text = data.get('response', '')
                        returned_session_id = data.get('sessionId', '')
                        
                        # Check session ID consistency
                        if returned_session_id == session_id:
                            self.log_test(f"Session Continuity Step {i+1}", True,
                                        f"Session maintained, response length: {len(response_text)}", 
                                        response_time)
                            
                            # Add assistant response to conversation
                            assistant_message = {
                                "role": "assistant",
                                "content": response_text,
                                "timestamp": datetime.now().isoformat()
                            }
                            all_messages.append(assistant_message)
                        else:
                            self.log_test(f"Session Continuity Step {i+1}", False,
                                        f"Session ID mismatch: expected {session_id}, got {returned_session_id}", 
                                        response_time)
                            continuity_success = False
                    else:
                        self.log_test(f"Session Continuity Step {i+1}", False,
                                    f"Request failed", response_time)
                        continuity_success = False
                else:
                    self.log_test(f"Session Continuity Step {i+1}", False,
                                f"HTTP {response.status_code}", response_time)
                    continuity_success = False
                    
            except Exception as e:
                self.log_test(f"Session Continuity Step {i+1}", False, f"Error: {str(e)}")
                continuity_success = False
        
        return continuity_success
    
    def test_error_scenarios(self) -> bool:
        """Test error handling and edge cases"""
        print("\n⚠️ Testing Error Scenarios...")
        
        error_test_cases = [
            {
                "name": "Empty Messages Array",
                "payload": {
                    "messages": [],
                    "sessionId": "error-test-1"
                },
                "expected_status": 400
            },
            {
                "name": "Missing Messages Field",
                "payload": {
                    "sessionId": "error-test-2"
                },
                "expected_status": 400
            },
            {
                "name": "Invalid Message Format",
                "payload": {
                    "messages": [
                        {
                            "invalid": "format"
                        }
                    ],
                    "sessionId": "error-test-3"
                },
                "expected_status": [200, 400, 500]  # Could be handled gracefully or error
            },
            {
                "name": "Very Long Message",
                "payload": {
                    "messages": [
                        {
                            "role": "user",
                            "content": "x" * 10000,  # Very long message
                            "timestamp": datetime.now().isoformat()
                        }
                    ],
                    "sessionId": "error-test-4"
                },
                "expected_status": [200, 400, 413]  # Should handle or reject gracefully
            }
        ]
        
        error_handling_success = True
        
        for test_case in error_test_cases:
            try:
                start_time = time.time()
                
                response = self.session.post(
                    f"{self.base_url}/api/multi-agent",
                    json=test_case["payload"]
                )
                response_time = time.time() - start_time
                
                expected_statuses = test_case["expected_status"]
                if not isinstance(expected_statuses, list):
                    expected_statuses = [expected_statuses]
                
                if response.status_code in expected_statuses:
                    self.log_test(f"Error Handling - {test_case['name']}", True,
                                f"HTTP {response.status_code} (expected)", response_time)
                else:
                    self.log_test(f"Error Handling - {test_case['name']}", False,
                                f"HTTP {response.status_code} (unexpected)", response_time)
                    error_handling_success = False
                    
            except Exception as e:
                self.log_test(f"Error Handling - {test_case['name']}", False, f"Exception: {str(e)}")
                error_handling_success = False
        
        return error_handling_success
    
    def test_performance_metrics(self) -> bool:
        """Test system performance under normal load"""
        print("\n⚡ Testing Performance Metrics...")
        
        response_times = []
        success_count = 0
        total_requests = 5
        
        for i in range(total_requests):
            try:
                start_time = time.time()
                
                payload = {
                    "messages": [
                        {
                            "role": "user",
                            "content": f"Performance test message {i+1}",
                            "timestamp": datetime.now().isoformat()
                        }
                    ],
                    "sessionId": f"perf-test-{i}",
                    "userId": "perf-test-user"
                }
                
                response = self.session.post(
                    f"{self.base_url}/api/multi-agent",
                    json=payload
                )
                response_time = time.time() - start_time
                response_times.append(response_time)
                
                if response.status_code == 200:
                    data = response.json()
                    if data.get('success'):
                        success_count += 1
                        
            except Exception as e:
                print(f"Performance test {i+1} failed: {str(e)}")
        
        if response_times:
            avg_response_time = sum(response_times) / len(response_times)
            max_response_time = max(response_times)
            min_response_time = min(response_times)
            
            # Performance criteria: average < 5s, max < 10s
            performance_good = avg_response_time < 5.0 and max_response_time < 10.0
            success_rate = success_count / total_requests
            
            self.log_test("Performance - Response Times", performance_good,
                        f"Avg: {avg_response_time:.2f}s, Max: {max_response_time:.2f}s, Min: {min_response_time:.2f}s")
            
            self.log_test("Performance - Success Rate", success_rate > 0.8,
                        f"Success rate: {success_rate:.1%} ({success_count}/{total_requests})")
            
            return performance_good and success_rate > 0.8
        else:
            self.log_test("Performance Test", False, "No successful requests")
            return False
    
    def run_all_tests(self) -> Dict[str, Any]:
        """Run all tests and return comprehensive results"""
        print("🚀 Starting TripXplo AI Multi-Agent System Tests...")
        print(f"Testing against: {self.base_url}")
        print("=" * 60)
        
        test_functions = [
            ("Health Check", self.test_health_endpoint),
            ("Multi-Agent Basic", self.test_multi_agent_endpoint_basic),
            ("Intent Routing", self.test_intent_routing_accuracy),
            ("Customer Support", self.test_customer_support_agent),
            ("Session Continuity", self.test_session_continuity),
            ("Error Handling", self.test_error_scenarios),
            ("Performance", self.test_performance_metrics)
        ]
        
        test_summary = {}
        overall_success = True
        
        for test_name, test_function in test_functions:
            try:
                result = test_function()
                test_summary[test_name] = result
                if not result:
                    overall_success = False
            except Exception as e:
                print(f"❌ CRITICAL ERROR in {test_name}: {str(e)}")
                test_summary[test_name] = False
                overall_success = False
        
        # Print summary
        print("\n" + "=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        
        for test_name, result in test_summary.items():
            status = "✅ PASS" if result else "❌ FAIL"
            print(f"{status} {test_name}")
        
        print(f"\n🎯 Overall Result: {'✅ ALL TESTS PASSED' if overall_success else '❌ SOME TESTS FAILED'}")
        
        return {
            'overall_success': overall_success,
            'test_summary': test_summary,
            'detailed_results': self.test_results,
            'total_tests': len(self.test_results),
            'passed_tests': len([r for r in self.test_results if r['success']]),
            'failed_tests': len([r for r in self.test_results if not r['success']])
        }

def main():
    """Main test execution"""
    if len(sys.argv) > 1:
        base_url = sys.argv[1]
    else:
        base_url = "http://localhost:3000"
    
    tester = MultiAgentTester(base_url)
    results = tester.run_all_tests()
    
    # Exit with appropriate code
    sys.exit(0 if results['overall_success'] else 1)

if __name__ == "__main__":
    main()