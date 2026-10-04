import React, { useState, useEffect } from 'react';
import { ShoppingBag, Truck, CheckCircle, Clock, User, Package, MapPin, DollarSign, Settings, Bell, Plus, Trash2, Edit2, X, Navigation, Crosshair, MapPinned, LocateFixed } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, updateDoc, onSnapshot, collection, addDoc, setDoc } from 'firebase/firestore';

// Initialize Firebase using environment variables
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('customer'); // 'customer', 'admin', or 'driver'
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Settings / Products State
  const [products, setProducts] = useState({
    'Wheat (Atta)': 15,
    'Chana (Besan)': 20,
    'Sattu': 25,
    'Mixed Masala': 60
  });

  // Customer Form State
  const [selectedItem, setSelectedItem] = useState('Wheat (Atta)');
  const [quantity, setQuantity] = useState(5);
  const [customerName, setCustomerName] = useState('');
  
  // Expanded Address Details
  const [pickup, setPickup] = useState({ area: '', gali: '', landmark: '', lat: null, lng: null });
  const [drop, setDrop] = useState({ area: '', gali: '', landmark: '', lat: null, lng: null });
  const [isFetchingLocation, setIsFetchingLocation] = useState(false);

  // Driver App State
  const [driverProfile, setDriverProfile] = useState({ name: '', phone: '' });
  const [isTrackingLive, setIsTrackingLive] = useState(false);
  const [activeWatchId, setActiveWatchId] = useState(null);
  
  // Notification State
  const [notification, setNotification] = useState(null);

  const showNotification = (message) => {
    setNotification(message);
    setTimeout(() => setNotification(null), 3000);
  };

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Auth Error:", error);
      }
    };
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    
    // Listen to Settings (Products/Prices)
    const settingsRef = doc(db, 'artifacts', appId, 'public', 'data', 'chakki_settings', 'pricing');
    const unsubSettings = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists() && docSnap.data().items) {
        setProducts(docSnap.data().items);
        setSelectedItem(prev => docSnap.data().items[prev] ? prev : Object.keys(docSnap.data().items)[0] || '');
      } else {
        setDoc(settingsRef, {
          items: { 'Wheat (Atta)': 15, 'Chana (Besan)': 20, 'Sattu': 25, 'Mixed Masala': 60 }
        });
      }
    });

    // Listen to Orders
    const ordersRef = collection(db, 'artifacts', appId, 'public', 'data', 'chakki_orders');
    const unsubscribe = onSnapshot(ordersRef, (snapshot) => {
      const fetchedOrders = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      fetchedOrders.sort((a, b) => b.createdAt - a.createdAt);
      setOrders(fetchedOrders);
      setIsLoading(false);
    }, (error) => {
      console.error("Firestore Error:", error);
      showNotification("Error connecting to database");
      setIsLoading(false);
    });

    return () => {
      unsubscribe();
      unsubSettings();
    };
  }, [user]);

  // Get Location using browser GPS & Reverse Geocoding
  const captureGPSLocation = (type) => {
    if (!navigator.geolocation) {
      showNotification("GPS not supported by your device!");
      return;
    }
    setIsFetchingLocation(true);
    showNotification("Fetching map location...");

    navigator.geolocation.getCurrentPosition(async (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      
      try {
        // Free OpenStreetMap Nominatim API for reverse geocoding
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
        const data = await response.json();
        const addressText = data.display_name || "Location captured on Map";

        if (type === 'pickup') {
          setPickup({ ...pickup, lat, lng, area: addressText });
        } else {
          setDrop({ ...drop, lat, lng, area: addressText });
        }
        showNotification("Location Fetched!");
      } catch (err) {
        // Fallback if API fails but GPS worked
        if (type === 'pickup') setPickup({ ...pickup, lat, lng, area: "GPS Location Saved" });
        else setDrop({ ...drop, lat, lng, area: "GPS Location Saved" });
        showNotification("GPS Captured, please enter area manually.");
      }
      setIsFetchingLocation(false);
    }, (error) => {
      showNotification("GPS Permission Denied.");
      setIsFetchingLocation(false);
    });
  };

  // Map Embed Component using OpenStreetMap
  const MapView = ({ lat, lng, label }) => {
    if (!lat || !lng) return null;
    return (
      <div className="w-full h-40 bg-gray-200 rounded-lg overflow-hidden relative border border-gray-300 shadow-inner mt-2">
        <iframe
          width="100%"
          height="100%"
          frameBorder="0"
          scrolling="no"
          marginHeight="0"
          marginWidth="0"
          src={`https://www.openstreetmap.org/export/embed.html?bbox=${lng-0.005},${lat-0.005},${lng+0.005},${lat+0.005}&layer=mapnik&marker=${lat},${lng}`}
        ></iframe>
        <div className="absolute top-2 left-2 bg-white/90 backdrop-blur px-2 py-1 text-xs font-bold rounded shadow-sm text-gray-800 flex items-center">
           <MapPin className="w-3 h-3 mr-1 text-red-500" /> {label}
        </div>
      </div>
    );
  };

  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    if (!user) return;
    if (!customerName || !pickup.area || !drop.area) {
      showNotification('Name, Pickup Area, and Drop Area are required!');
      return;
    }

    const newOrder = {
      customerName,
      item: selectedItem,
      quantity: Number(quantity),
      status: 'Pending Pickup',
      pickupDetails: pickup,
      dropDetails: drop,
      price: quantity * (products[selectedItem] || 0),
      driverName: '',
      driverPhone: '',
      driverLocation: null, // For live tracking
      date: new Date().toISOString().split('T')[0],
      createdAt: Date.now(),
      userId: user.uid
    };

    try {
      const ordersRef = collection(db, 'artifacts', appId, 'public', 'data', 'chakki_orders');
      await addDoc(ordersRef, newOrder);
      showNotification('Order Placed Successfully!');
      // Reset form
      setPickup({ area: '', gali: '', landmark: '', lat: null, lng: null });
      setDrop({ area: '', gali: '', landmark: '', lat: null, lng: null });
      setQuantity(5);
    } catch (error) {
      showNotification('Failed to place order.');
    }
  };

  const updateOrderDetails = async (orderId, updates) => {
    if (!user) return;
    try {
      const orderRef = doc(db, 'artifacts', appId, 'public', 'data', 'chakki_orders', orderId);
      await updateDoc(orderRef, updates);
    } catch (error) {
      console.error("Error updating doc:", error);
    }
  };

  const StatusBadge = ({ status }) => {
    let colorClass = 'bg-gray-100 text-gray-800';
    let Icon = Clock;
    switch(status) {
      case 'Pending Pickup': colorClass = 'bg-yellow-100 text-yellow-800'; Icon = Clock; break;
      case 'Heading to Pickup': colorClass = 'bg-blue-100 text-blue-800'; Icon = Navigation; break;
      case 'Picked Up': colorClass = 'bg-indigo-100 text-indigo-800'; Icon = Package; break;
      case 'In Process': colorClass = 'bg-purple-100 text-purple-800'; Icon = Settings; break;
      case 'Out for Delivery': colorClass = 'bg-orange-100 text-orange-800'; Icon = Truck; break;
      case 'Delivered': colorClass = 'bg-green-100 text-green-800'; Icon = CheckCircle; break;
      default: break;
    }
    return (
      <span className={`flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium shadow-sm border border-white/50 ${colorClass}`}>
        <Icon className="w-3 h-3 mr-1" /> {status}
      </span>
    );
  };

  const CustomerView = () => {
    const customerOrders = customerName 
      ? orders.filter(o => o.customerName.toLowerCase() === customerName.toLowerCase())
      : orders.slice(0, 2);

    return (
      <div className="max-w-md mx-auto bg-white min-h-screen pb-20 shadow-xl">
        <div className="bg-gradient-to-r from-orange-600 to-red-600 text-white p-6 rounded-b-3xl shadow-md">
          <h1 className="text-2xl font-bold">Chakki Fresh</h1>
          <p className="text-orange-100 text-sm mt-1">Smart Pickup & Drop Milling Service</p>
        </div>

        <div className="p-6">
          <h2 className="text-lg font-semibold mb-4 text-gray-800 flex items-center">
            <ShoppingBag className="w-5 h-5 mr-2 text-orange-500" />
            Place New Request
          </h2>
          
          <form onSubmit={handlePlaceOrder} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
              <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)}
                className="w-full border border-gray-300 rounded-xl p-2.5 focus:ring-2 focus:ring-orange-500 outline-none"
                placeholder="Name for order tracking" />
            </div>

            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Grain/Spice</label>
                <select value={selectedItem} onChange={(e) => setSelectedItem(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl p-2.5 bg-white outline-none">
                  {Object.keys(products).map(item => (
                    <option key={item} value={item}>{item} (₹{products[item]})</option>
                  ))}
                </select>
              </div>
              <div className="w-24">
                <label className="block text-sm font-medium text-gray-700 mb-1">Qty (kg)</label>
                <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl p-2.5 outline-none text-center font-bold" />
              </div>
            </div>

            {/* Advanced Address Section */}
            <div className="space-y-4 pt-2 border-t border-gray-100">
              {/* PICKUP ADDRESS */}
              <div className="bg-gray-50 p-3 rounded-xl border border-gray-200">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-semibold text-gray-700 text-sm flex items-center">
                    <MapPin className="w-4 h-4 mr-1 text-blue-500"/> Pickup Location
                  </span>
                  <button type="button" onClick={() => captureGPSLocation('pickup')} disabled={isFetchingLocation}
                    className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded flex items-center hover:bg-blue-200 transition">
                    <LocateFixed className="w-3 h-3 mr-1" /> Use GPS Map
                  </button>
                </div>
                <input type="text" placeholder="Area / Main Address" value={pickup.area} onChange={e => setPickup({...pickup, area: e.target.value})}
                  className="w-full text-sm border border-gray-300 rounded p-2 mb-2 outline-none" />
                <div className="flex gap-2">
                  <input type="text" placeholder="Gali / House No" value={pickup.gali} onChange={e => setPickup({...pickup, gali: e.target.value})}
                    className="w-1/2 text-sm border border-gray-300 rounded p-2 outline-none" />
                  <input type="text" placeholder="Landmark" value={pickup.landmark} onChange={e => setPickup({...pickup, landmark: e.target.value})}
                    className="w-1/2 text-sm border border-gray-300 rounded p-2 outline-none" />
                </div>
                {pickup.lat && <MapView lat={pickup.lat} lng={pickup.lng} label="Pickup Pinned" />}
              </div>

              {/* DROP ADDRESS */}
              <div className="bg-gray-50 p-3 rounded-xl border border-gray-200">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-semibold text-gray-700 text-sm flex items-center">
                    <MapPin className="w-4 h-4 mr-1 text-green-500"/> Drop Location
                  </span>
                  <button type="button" onClick={() => captureGPSLocation('drop')} disabled={isFetchingLocation}
                    className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded flex items-center hover:bg-green-200 transition">
                    <LocateFixed className="w-3 h-3 mr-1" /> Use GPS Map
                  </button>
                </div>
                <input type="text" placeholder="Area / Main Address" value={drop.area} onChange={e => setDrop({...drop, area: e.target.value})}
                  className="w-full text-sm border border-gray-300 rounded p-2 mb-2 outline-none" />
                <div className="flex gap-2">
                  <input type="text" placeholder="Gali / House No" value={drop.gali} onChange={e => setDrop({...drop, gali: e.target.value})}
                    className="w-1/2 text-sm border border-gray-300 rounded p-2 outline-none" />
                  <input type="text" placeholder="Landmark" value={drop.landmark} onChange={e => setDrop({...drop, landmark: e.target.value})}
                    className="w-1/2 text-sm border border-gray-300 rounded p-2 outline-none" />
                </div>
                {drop.lat && <MapView lat={drop.lat} lng={drop.lng} label="Drop Pinned" />}
              </div>
            </div>

            <div className="bg-orange-50 p-4 rounded-xl flex justify-between items-center border border-orange-100">
              <span className="text-gray-700 font-medium">Estimated Bill:</span>
              <span className="text-2xl font-black text-orange-600">₹{quantity * (products[selectedItem] || 0)}</span>
            </div>

            <button type="submit" disabled={isLoading || !user}
              className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-bold py-3.5 px-4 rounded-xl transition shadow-lg flex justify-center items-center">
              <Package className="w-5 h-5 mr-2" /> Schedule Order
            </button>
          </form>
        </div>

        {/* Live Order Tracking Section */}
        <div className="p-6 pt-0 mt-2">
          <h2 className="text-lg font-semibold mb-4 text-gray-800 flex items-center">
            <Crosshair className="w-5 h-5 mr-2 text-blue-500" /> Live Tracking
          </h2>
          {customerOrders.length === 0 ? (
            <p className="text-gray-500 text-sm">No active orders found for this name.</p>
          ) : (
            <div className="space-y-4">
              {customerOrders.map(order => (
                <div key={order.id} className="border border-gray-200 rounded-xl p-4 bg-white shadow-sm overflow-hidden">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <span className="font-bold text-gray-800 block text-lg">{order.item}</span>
                      <span className="text-gray-500 text-sm">{order.quantity}kg • ₹{order.price}</span>
                    </div>
                    <StatusBadge status={order.status} />
                  </div>
                  
                  {/* Delivery Partner Details */}
                  {order.driverName && (
                    <div className="bg-blue-50 rounded-lg p-3 mb-3 border border-blue-100 flex items-center">
                      <div className="bg-blue-200 p-2 rounded-full mr-3"><User className="w-4 h-4 text-blue-700"/></div>
                      <div>
                        <p className="text-sm font-semibold text-blue-900">Partner: {order.driverName}</p>
                        <p className="text-xs text-blue-700 font-medium">Ph: {order.driverPhone}</p>
                      </div>
                    </div>
                  )}

                  {/* Live Map Tracking UI */}
                  {order.driverLocation && (order.status === 'Heading to Pickup' || order.status === 'Out for Delivery') && (
                     <div className="mt-3 border-t border-gray-100 pt-3">
                        <p className="text-xs font-bold text-gray-500 mb-2 flex items-center animate-pulse">
                          <span className="w-2 h-2 rounded-full bg-red-500 mr-2"></span> Driver is sharing live location
                        </p>
                        <MapView lat={order.driverLocation.lat} lng={order.driverLocation.lng} label="Partner Current Location" />
                     </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const DriverView = () => {
    // Only show active orders that are either unassigned or assigned to this driver
    const availableOrders = orders.filter(o => 
      o.status !== 'Delivered' && 
      (!o.driverName || o.driverName === driverProfile.name)
    );

    const handleAcceptOrder = (order) => {
      if(!driverProfile.name || !driverProfile.phone) {
        showNotification("Please set your Name and Phone first!");
        return;
      }
      updateOrderDetails(order.id, {
        driverName: driverProfile.name,
        driverPhone: driverProfile.phone,
        status: 'Heading to Pickup'
      });
      showNotification("Order Accepted! Head to Pickup.");
    };

    const toggleLiveTracking = (orderId) => {
      if (isTrackingLive) {
        // Stop tracking
        if(activeWatchId) navigator.geolocation.clearWatch(activeWatchId);
        setIsTrackingLive(false);
        setActiveWatchId(null);
        showNotification("Live Tracking Stopped.");
      } else {
        // Start tracking
        if (!navigator.geolocation) return showNotification("GPS Not Supported");
        setIsTrackingLive(true);
        showNotification("Live Tracking Started!");
        const id = navigator.geolocation.watchPosition(
          (pos) => {
            updateOrderDetails(orderId, {
              driverLocation: { lat: pos.coords.latitude, lng: pos.coords.longitude }
            });
          },
          (err) => console.error(err),
          { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
        );
        setActiveWatchId(id);
      }
    };

    // Cleanup GPS on unmount
    useEffect(() => {
      return () => {
        if(activeWatchId) navigator.geolocation.clearWatch(activeWatchId);
      }
    }, [activeWatchId]);

    return (
      <div className="max-w-md mx-auto bg-slate-50 min-h-screen pb-20 shadow-xl">
        <div className="bg-slate-900 text-white p-6 rounded-b-3xl shadow-md">
          <h1 className="text-2xl font-bold flex items-center">
            <Navigation className="w-6 h-6 mr-2 text-blue-400" /> Partner App
          </h1>
          <p className="text-slate-300 text-sm mt-1">Accept & Track Deliveries</p>
        </div>

        {/* Driver Profile Setup */}
        <div className="p-6">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-6">
            <h3 className="font-semibold text-slate-700 mb-3 text-sm">My Details (Required)</h3>
            <div className="flex gap-2">
              <input type="text" placeholder="Your Name" value={driverProfile.name} onChange={e => setDriverProfile({...driverProfile, name: e.target.value})}
                className="w-1/2 border border-slate-300 rounded-lg p-2 text-sm outline-none focus:border-blue-500" />
              <input type="text" placeholder="Phone No." value={driverProfile.phone} onChange={e => setDriverProfile({...driverProfile, phone: e.target.value})}
                className="w-1/2 border border-slate-300 rounded-lg p-2 text-sm outline-none focus:border-blue-500" />
            </div>
          </div>

          <h2 className="text-lg font-bold text-slate-800 mb-4">Active Tasks</h2>
          
          <div className="space-y-4">
            {availableOrders.length === 0 && <p className="text-slate-500 text-sm">No pending tasks right now.</p>}
            
            {availableOrders.map(order => {
              const isMyOrder = order.driverName === driverProfile.name;
              
              return (
                <div key={order.id} className={`border rounded-xl p-4 shadow-sm ${isMyOrder ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-200'}`}>
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-bold text-slate-800">{order.customerName}</span>
                    <StatusBadge status={order.status} />
                  </div>
                  <p className="text-sm font-medium text-slate-600 mb-3">{order.item} • {order.quantity}kg (₹{order.price})</p>

                  {/* Addresses */}
                  <div className="bg-slate-100 p-2 rounded-lg text-xs space-y-1 mb-4">
                    <p><span className="font-bold text-blue-600">P:</span> {order.pickupDetails?.area} {order.pickupDetails?.gali}</p>
                    <p><span className="font-bold text-green-600">D:</span> {order.dropDetails?.area} {order.dropDetails?.gali}</p>
                  </div>

                  {!isMyOrder ? (
                    <button onClick={() => handleAcceptOrder(order)}
                      className="w-full bg-slate-800 hover:bg-slate-900 text-white font-semibold py-2.5 rounded-lg text-sm shadow">
                      Accept Delivery Task
                    </button>
                  ) : (
                    <div className="space-y-3">
                      {/* Driver Actions Based on Status */}
                      <div className="grid grid-cols-2 gap-2">
                        {order.status === 'Heading to Pickup' && (
                           <button onClick={() => updateOrderDetails(order.id, {status: 'Picked Up'})} className="col-span-2 bg-indigo-500 text-white py-2 rounded-lg font-medium text-sm">Confirm Pickup</button>
                        )}
                        {order.status === 'Picked Up' && (
                           <button onClick={() => updateOrderDetails(order.id, {status: 'In Process'})} className="col-span-2 bg-purple-500 text-white py-2 rounded-lg font-medium text-sm">Drop at Chakki (Processing)</button>
                        )}
                        {order.status === 'In Process' && (
                           <button onClick={() => updateOrderDetails(order.id, {status: 'Out for Delivery'})} className="col-span-2 bg-orange-500 text-white py-2 rounded-lg font-medium text-sm">Start Delivery Trip</button>
                        )}
                        {order.status === 'Out for Delivery' && (
                           <button onClick={() => updateOrderDetails(order.id, {status: 'Delivered'})} className="col-span-2 bg-green-500 text-white py-2 rounded-lg font-medium text-sm">Mark as Delivered</button>
                        )}
                      </div>

                      {/* Map Helpers for Driver */}
                      {(order.status === 'Heading to Pickup' || order.status === 'Out for Delivery') && (
                        <div className="bg-white p-3 rounded-lg border border-blue-100">
                           <p className="text-xs font-bold text-slate-600 mb-2">Navigation Helpers:</p>
                           {order.status === 'Heading to Pickup' && order.pickupDetails?.lat && <MapView lat={order.pickupDetails.lat} lng={order.pickupDetails.lng} label="Destination: Pickup" />}
                           {order.status === 'Out for Delivery' && order.dropDetails?.lat && <MapView lat={order.dropDetails.lat} lng={order.dropDetails.lng} label="Destination: Drop" />}
                           
                           <button onClick={() => toggleLiveTracking(order.id)}
                            className={`mt-3 w-full flex items-center justify-center py-2 rounded-lg text-sm font-bold border-2 transition ${isTrackingLive ? 'border-red-500 text-red-500 bg-red-50' : 'border-blue-500 text-blue-500 bg-blue-50'}`}>
                            <MapPinned className="w-4 h-4 mr-1" />
                            {isTrackingLive ? 'Stop Live GPS Sharing' : 'Start Live GPS Sharing'}
                           </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const AdminView = () => {
    // Reusing the robust admin view from previous iterations, updated to read complex addresses
    return (
      <div className="w-full max-w-5xl mx-auto bg-gray-50 min-h-screen pb-10 shadow-2xl rounded-lg overflow-hidden">
        <div className="bg-slate-800 text-white p-6 shadow-md flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold flex items-center"><Settings className="w-6 h-6 mr-2 text-blue-400" /> Admin Master</h1>
            <p className="text-slate-300 text-sm mt-1">Total Overview</p>
          </div>
        </div>

        <div className="p-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-gray-600 text-sm border-b">
                    <th className="p-4 font-medium">Customer & Details</th>
                    <th className="p-4 font-medium">Locations</th>
                    <th className="p-4 font-medium">Status & Driver</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {orders.map((order) => (
                    <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                      <td className="p-4 text-sm">
                        <div className="font-bold text-gray-900 text-base">{order.customerName}</div>
                        <div className="text-gray-600 mt-1">{order.item} • {order.quantity}kg • ₹{order.price}</div>
                        <div className="text-xs text-gray-400 mt-1">{new Date(order.createdAt).toLocaleString()}</div>
                      </td>
                      <td className="p-4 text-sm max-w-[200px]">
                        <div className="mb-2">
                          <span className="text-xs font-bold text-blue-500 uppercase">Pickup:</span>
                          <div className="text-gray-700 truncate">{order.pickupDetails?.area || 'No Area'}</div>
                          <div className="text-xs text-gray-500">{order.pickupDetails?.gali} {order.pickupDetails?.landmark}</div>
                        </div>
                        <div>
                          <span className="text-xs font-bold text-green-500 uppercase">Drop:</span>
                          <div className="text-gray-700 truncate">{order.dropDetails?.area || 'No Area'}</div>
                          <div className="text-xs text-gray-500">{order.dropDetails?.gali} {order.dropDetails?.landmark}</div>
                        </div>
                      </td>
                      <td className="p-4">
                        <StatusBadge status={order.status} />
                        {order.driverName ? (
                          <div className="mt-2 text-xs font-medium text-slate-600 bg-slate-100 px-2 py-1 rounded inline-block">
                            Driver: {order.driverName} ({order.driverPhone})
                          </div>
                        ) : (
                          <div className="mt-2 text-xs font-medium text-red-500">Unassigned</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-200 font-sans">
      
      {/* 3-Way Mode Switcher App Bar */}
      <div className="bg-gray-900 p-3 flex justify-center space-x-2 md:space-x-4 sticky top-0 z-50 shadow-md overflow-x-auto">
        <button onClick={() => setView('customer')}
          className={`px-3 py-2 rounded-lg font-bold text-sm whitespace-nowrap transition ${view === 'customer' ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
          Customer App
        </button>
        <button onClick={() => setView('driver')}
          className={`px-3 py-2 rounded-lg font-bold text-sm whitespace-nowrap transition ${view === 'driver' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
          Partner (Driver) App
        </button>
        <button onClick={() => setView('admin')}
          className={`px-3 py-2 rounded-lg font-bold text-sm whitespace-nowrap transition ${view === 'admin' ? 'bg-slate-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
          Admin View
        </button>
      </div>

      {!user && !isLoading && (
         <div className="bg-red-500 text-white text-center p-2 text-sm font-bold">
           Connecting to Database...
         </div>
      )}

      {/* Render Selected View */}
      <div className="p-2 md:p-6">
        {view === 'customer' && <CustomerView />}
        {view === 'driver' && <DriverView />}
        {view === 'admin' && <AdminView />}
      </div>

      {/* Global Toast */}
      {notification && (
        <div className="fixed bottom-6 right-6 bg-gray-900 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center animate-bounce z-50 border border-gray-700 font-medium">
          <CheckCircle className="w-5 h-5 mr-2 text-green-400" />
          {notification}
        </div>
      )}
    </div>
  );
}